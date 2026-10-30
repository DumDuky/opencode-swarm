import { SwarmError } from "./errors.js"
import type { MemberID, Role, Swarm, Task, TaskID, TaskStatus } from "./types.js"
import { now, parsePathSpec, pathsOverlap } from "./util.js"

export interface TaskInput {
  key?: string
  title: string
  description: string
  role: Role
  files?: string[]
  dependsOn?: string[]
  acceptance: string
  size?: "small" | "medium" | "large"
}

export interface BoardCreateResult {
  created: Task[]
  errors: string[]
}

const OPEN_STATUSES: TaskStatus[] = ["todo", "claimed", "working", "blocked", "review"]

const ROLE_CAN_DO: Record<Role, Role[]> = {
  orchestrator: ["worker", "tester", "integrator", "scout", "reviewer", "planner"],
  worker: ["worker", "tester", "integrator"],
  tester: ["tester"],
  integrator: ["integrator"],
  scout: ["scout"],
  reviewer: ["reviewer"],
  planner: ["planner"],
}

export class Board {
  readonly swarm: Swarm

  constructor(swarm: Swarm) {
    this.swarm = swarm
  }

  createMany(inputs: TaskInput[], actor: MemberID): BoardCreateResult {
    const actorMember = this.swarm.members.get(actor)
    if (!actorMember || actorMember.role !== "orchestrator") {
      return { created: [], errors: ["Only the orchestrator can create tasks."] }
    }
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return { created: [], errors: ["At least one task is required."] }
    }

    const errors: string[] = []
    const keys = new Map<string, TaskInput>()
    const idsByKey = new Map<string, TaskID>()
    const existingByKey = new Map<string, Task>()
    for (const task of this.swarm.tasks.values()) {
      if (task.key) existingByKey.set(task.key, task)
    }

    for (const [index, input] of inputs.entries()) {
      const prefix = `tasks[${index}]`
      if (!input || typeof input !== "object") {
        errors.push(`${prefix}: invalid task.`)
        continue
      }
      const title = (input.title ?? "").trim()
      const description = (input.description ?? "").trim()
      const acceptance = (input.acceptance ?? "").trim()
      if (!title) errors.push(`${prefix}: title is required.`)
      if (!description) errors.push(`${prefix}: description is required.`)
      if (!acceptance) errors.push(`${prefix}: acceptance is required.`)
      if (!ROLE_CAN_DO[input.role]) {
        errors.push(`${prefix}: unknown role "${String(input.role)}".`)
        continue
      }
      if (input.role === "orchestrator") errors.push(`${prefix}: tasks cannot target the orchestrator role.`)
      const size = input.size ?? "medium"
      if (!["small", "medium", "large"].includes(size)) {
        errors.push(`${prefix}: size must be small, medium, or large.`)
      }
      const key = input.key?.trim()
      if (key) {
        if (keys.has(key) || existingByKey.has(key)) {
          errors.push(`${prefix}: duplicate task key "${key}".`)
        } else {
          keys.set(key, input)
        }
      }
      const files = (input.files ?? []).map((file) => file.trim()).filter(Boolean)
      if (files.length === 0 && input.role !== "scout" && input.role !== "reviewer" && input.role !== "planner") {
        errors.push(`${prefix}: files is required for role "${input.role}".`)
      }
    }

    if (errors.length > 0) return { created: [], errors }

    const newTasks: Task[] = []
    for (const input of inputs) {
      const id = `t${++this.swarm.counters.task}`
      const task: Task = {
        id,
        swarmID: this.swarm.id,
        key: input.key?.trim() || undefined,
        title: input.title.trim(),
        description: input.description.trim(),
        role: input.role,
        status: "todo",
        files: (input.files ?? []).map((file) => file.trim()).filter(Boolean),
        dependsOn: [],
        acceptance: input.acceptance.trim(),
        size: input.size ?? "medium",
        attempts: 0,
        createdAt: now(),
        updatedAt: now(),
      }
      newTasks.push(task)
      if (task.key) idsByKey.set(task.key, task.id)
    }

    const allById = new Map<TaskID, Task>([...this.swarm.tasks].map(([id, task]) => [id, task]))
    for (const task of newTasks) allById.set(task.id, task)

    for (const [index, input] of inputs.entries()) {
      const task = newTasks[index]
      for (const dep of input.dependsOn ?? []) {
        const depID = idsByKey.get(dep) ?? (allById.has(dep) ? dep : existingByKey.get(dep)?.id)
        if (!depID) {
          errors.push(`Task "${task.title}" depends on unknown task "${dep}".`)
          continue
        }
        if (depID === task.id) {
          errors.push(`Task "${task.title}" cannot depend on itself.`)
          continue
        }
        task.dependsOn.push(depID)
      }
    }

    if (errors.length > 0) return { created: [], errors }

    const cycle = findCycle([...allById.values()])
    if (cycle) {
      return { created: [], errors: [`Dependency cycle: ${cycle.join(" -> ")}`] }
    }

    for (const task of newTasks) {
      if (task.files.length === 0) continue
      for (const other of allById.values()) {
        if (other.id === task.id) continue
        if (!OPEN_STATUSES.includes(other.status)) continue
        if (other.files.length === 0) continue
        if (!tasksOverlap(task, other)) continue
        if (dependsOnEither(task, other, allById)) continue
        errors.push(
          `Write-set conflict: "${task.title}" and "${other.title}" both touch ${overlapDescription(task, other)}. ` +
            `Add a dependency between them or split the files.`,
        )
      }
    }

    if (errors.length > 0) return { created: [], errors }

    for (const task of newTasks) {
      this.swarm.tasks.set(task.id, task)
    }
    this.touch()
    return { created: newTasks, errors: [] }
  }

  list(filter?: { status?: TaskStatus; owner?: MemberID }): Task[] {
    return [...this.swarm.tasks.values()]
      .filter((task) => (filter?.status ? task.status === filter.status : true))
      .filter((task) => (filter?.owner ? task.owner === filter.owner : true))
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  get(taskID: TaskID): Task | undefined {
    return this.swarm.tasks.get(taskID)
  }

  getByKey(key: string): Task | undefined {
    for (const task of this.swarm.tasks.values()) {
      if (task.key === key) return task
    }
    return undefined
  }

  claim(taskID: TaskID, memberID: MemberID): Task {
    const task = this.swarm.tasks.get(taskID)
    if (!task) throw new SwarmError(`Task ${taskID} not found.`)
    const member = this.swarm.members.get(memberID)
    if (!member) throw new SwarmError(`Member ${memberID} not found.`)
    if (task.status !== "todo") throw new SwarmError(`Task ${taskID} is ${task.status}, not todo.`)
    if (task.owner && task.owner !== memberID) throw new SwarmError(`Task ${taskID} is already owned by ${task.owner}.`)
    if (!ROLE_CAN_DO[member.role]?.includes(task.role)) {
      throw new SwarmError(`Member ${memberID} (${member.role}) cannot claim a ${task.role} task.`)
    }
    const missing = this.missingDependencies(task)
    if (missing.length > 0) {
      throw new SwarmError(`Task ${taskID} is blocked by unfinished dependencies: ${missing.join(", ")}.`)
    }
    task.owner = memberID
    task.status = "claimed"
    task.budgetBlocked = false
    task.startedAt ??= now()
    task.updatedAt = now()
    this.touch()
    return task
  }

  claimNext(memberID: MemberID): Task | undefined {
    const member = this.swarm.members.get(memberID)
    if (!member) throw new SwarmError(`Member ${memberID} not found.`)
    for (const task of this.list({ status: "todo" })) {
      if (!ROLE_CAN_DO[member.role]?.includes(task.role)) continue
      if (this.missingDependencies(task).length > 0) continue
      task.owner = memberID
      task.status = "claimed"
      task.budgetBlocked = false
      task.startedAt ??= now()
      task.updatedAt = now()
      this.touch()
      return task
    }
    return undefined
  }

  update(
    taskID: TaskID,
    actor: MemberID,
    patch: {
      status?: TaskStatus
      result?: string
      blockers?: string
      files?: string[]
      acceptance?: string
    },
  ): Task {
    const task = this.swarm.tasks.get(taskID)
    if (!task) throw new SwarmError(`Task ${taskID} not found.`)
    const member = this.swarm.members.get(actor)
    if (!member) throw new SwarmError(`Member ${actor} not found.`)
    if (task.owner !== actor && member.role !== "orchestrator") {
      throw new SwarmError(`Task ${taskID} is owned by ${task.owner ?? "nobody"}; only the owner or orchestrator can update it.`)
    }
    if (patch.status) {
      if (!allowedTransition(task.status, patch.status)) {
        throw new SwarmError(`Invalid task transition ${task.status} -> ${patch.status}.`)
      }
      task.status = patch.status
      if (patch.status === "done" || patch.status === "failed") task.finishedAt = now()
      if (patch.status === "working") task.startedAt ??= now()
      if (patch.status === "todo") {
        task.owner = undefined
        task.finishedAt = undefined
      }
    }
    if (patch.result !== undefined) task.result = patch.result
    if (patch.blockers !== undefined) task.blockers = patch.blockers
    if (patch.files !== undefined) {
      const newFiles = patch.files.map((file) => file.trim()).filter(Boolean)
      if (task.status !== "done" && task.status !== "failed") {
        const candidate: Task = { ...task, files: newFiles }
        for (const other of this.swarm.tasks.values()) {
          if (other.id === task.id) continue
          if (!OPEN_STATUSES.includes(other.status)) continue
          if (other.files.length === 0 || newFiles.length === 0) continue
          if (!tasksOverlap(candidate, other)) continue
          if (dependsOnEither(candidate, other, this.swarm.tasks)) continue
          throw new SwarmError(
            `Write-set conflict: "${task.title}" and "${other.title}" both touch ${overlapDescription(candidate, other)}. ` +
              `Add a dependency between them or split the files.`,
          )
        }
      }
      task.files = newFiles
    }
    if (patch.acceptance !== undefined) task.acceptance = patch.acceptance
    task.updatedAt = now()
    this.touch()
    return task
  }

  release(taskID: TaskID, actor: MemberID): Task {
    const task = this.swarm.tasks.get(taskID)
    if (!task) throw new SwarmError(`Task ${taskID} not found.`)
    const member = this.swarm.members.get(actor)
    if (!member) throw new SwarmError(`Member ${actor} not found.`)
    if (task.owner !== actor && member.role !== "orchestrator") {
      throw new SwarmError(`Task ${taskID} is owned by ${task.owner ?? "nobody"}.`)
    }
    task.status = "todo"
    task.owner = undefined
    task.blockers = undefined
    task.finishedAt = undefined
    task.updatedAt = now()
    this.touch()
    return task
  }

  missingDependencies(task: Task): TaskID[] {
    const missing: TaskID[] = []
    for (const dep of task.dependsOn) {
      const dependency = this.swarm.tasks.get(dep)
      if (!dependency || dependency.status !== "done") missing.push(dep)
    }
    return missing
  }

  readyTasks(): Task[] {
    return this.list({ status: "todo" }).filter((task) => this.missingDependencies(task).length === 0)
  }

  allDone(): boolean {
    const tasks = [...this.swarm.tasks.values()]
    return tasks.length > 0 && tasks.every((task) => task.status === "done" || task.status === "failed")
  }

  progress(): { total: number; done: number; failed: number; open: number; working: number } {
    const tasks = [...this.swarm.tasks.values()]
    return {
      total: tasks.length,
      done: tasks.filter((task) => task.status === "done").length,
      failed: tasks.filter((task) => task.status === "failed").length,
      open: tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length,
      working: tasks.filter((task) => task.status === "working" || task.status === "claimed").length,
    }
  }

  private touch() {
    this.swarm.updatedAt = now()
    this.swarm.version++
  }
}

function allowedTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    todo: ["todo", "claimed", "working"],
    claimed: ["claimed", "working", "todo", "blocked", "failed", "done", "review"],
    working: ["working", "blocked", "review", "done", "failed", "todo"],
    blocked: ["blocked", "working", "failed", "todo", "done", "review"],
    review: ["review", "done", "failed", "working"],
    done: ["done"],
    failed: ["failed", "todo", "working"],
  }
  return allowed[from].includes(to)
}

function tasksOverlap(a: Task, b: Task): boolean {
  for (const left of a.files) {
    const leftSpec = parsePathSpec(left)
    for (const right of b.files) {
      const rightSpec = parsePathSpec(right)
      if (pathsOverlap(leftSpec, rightSpec)) return true
    }
  }
  return false
}

function overlapDescription(a: Task, b: Task): string {
  const matches: string[] = []
  for (const left of a.files) {
    const leftSpec = parsePathSpec(left)
    for (const right of b.files) {
      const rightSpec = parsePathSpec(right)
      if (pathsOverlap(leftSpec, rightSpec)) matches.push(`${left} ↔ ${right}`)
    }
  }
  return matches.slice(0, 3).join(", ") || "the same files"
}

function dependsOnEither(a: Task, b: Task, all: Map<TaskID, Task>): boolean {
  return reaches(a, b.id, all, new Set()) || reaches(b, a.id, all, new Set())
}

function reaches(from: Task, target: TaskID, all: Map<TaskID, Task>, seen: Set<TaskID>): boolean {
  if (seen.has(from.id)) return false
  seen.add(from.id)
  for (const dep of from.dependsOn) {
    if (dep === target) return true
    const next = all.get(dep)
    if (next && reaches(next, target, all, seen)) return true
  }
  return false
}

function findCycle(tasks: Task[]): TaskID[] | undefined {
  const byID = new Map(tasks.map((task) => [task.id, task]))
  const state = new Map<TaskID, 0 | 1 | 2>()
  const stack: TaskID[] = []

  const visit = (id: TaskID): TaskID[] | undefined => {
    const current = state.get(id) ?? 0
    if (current === 1) {
      const start = stack.indexOf(id)
      return [...stack.slice(start), id]
    }
    if (current === 2) return undefined
    state.set(id, 1)
    stack.push(id)
    for (const dep of byID.get(id)?.dependsOn ?? []) {
      const cycle = visit(dep)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(id, 2)
    return undefined
  }

  for (const task of tasks) {
    const cycle = visit(task.id)
    if (cycle) return cycle
  }
  return undefined
}
