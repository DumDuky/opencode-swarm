import { describe, expect, test } from "bun:test"
import path from "node:path"
import { loadConfig } from "../src/config.js"
import { SwarmService } from "../src/service.js"
import { createReadySwarm } from "./test-context.js"

describe("swarm service", () => {
  test("spawns a worker for a task, finishes it, and returns a summary", async () => {
    const { service, runtime, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Implement login",
        description: "Add the login endpoint",
        role: "worker",
        files: ["src/auth/login.ts"],
        acceptance: "Login works and tests pass",
        size: "small",
      },
    ])
    const task = created.created[0]
    const spawned = await service.spawn(rootSessionID, { taskID: task.id })
    expect(spawned.status).toBe("spawned")
    const member = spawned.member!
    expect(member.role).toBe("worker")
    expect(member.depth).toBe(1)
    expect(member.sessionID).toBeDefined()
    const child = await runtime.getSession(member.sessionID)
    expect(child?.parentID).toBe(rootSessionID)
    expect(child?.metadata?.["swarm.id"]).toBeDefined()
    expect(child?.metadata?.["swarm.member"]).toBe(member.id)
    expect(runtime.prompts.get(member.sessionID)?.length).toBe(1)
    expect(service.listTasks(rootSessionID)[0]).toMatchObject({ owner: member.id, status: "claimed" })

    const finished = await service.finish(member.sessionID, {
      taskID: task.id,
      summary: "Implemented login",
      files: ["src/auth/login.ts"],
      tests: "bun test auth",
    })
    expect(finished.task?.status).toBe("done")
    expect(finished.member.status).toBe("done")

    const waited = await service.waitFor(rootSessionID, [], "all", 1000)
    expect(waited.timedOut).toBe(false)
    expect(waited.results[0].status).toBe("done")
    expect(waited.results[0].summary).toContain("Implemented login")
  })

  test("enforces task write-sets and auto-claims files", async () => {
    const { service, runtime, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "A",
        description: "A",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "A",
      },
      {
        title: "B",
        description: "B",
        role: "worker",
        files: ["src/b.ts"],
        acceptance: "B",
      },
    ])
    const [a, b] = created.created
    const w1 = (await service.spawn(rootSessionID, { taskID: a.id })).member!
    const w2 = (await service.spawn(rootSessionID, { taskID: b.id })).member!

    expect(service.checkEdit(w1.sessionID, ["src/a.ts"]).deny).toBe(false)
    expect(service.checkEdit(w1.sessionID, ["src/b.ts"]).deny).toBe(true)
    expect(service.checkEdit(w1.sessionID, ["src/b.ts"]).message).toContain("outside your task write-set")

    const outside = await service.claimFiles(w2.sessionID, ["src/a.ts"])
    expect(outside.status).toBe("conflict")
    expect(outside.message).toContain("outside your task write-set")

    const claim = await service.claimFiles(w1.sessionID, ["src/a.ts"])
    expect(claim.status).toBe("claimed")
    expect(claim.leases?.[0].owner).toBe(w1.id)
    expect(runtime.sessions.has(w1.sessionID)).toBe(true)
  })

  test("detects stale reads after another writer changes the file", async () => {
    const { service, runtime, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "A",
        description: "A",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "A",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    runtime.hashes.set(path.resolve(runtime.workspaceRoot, "src/a.ts"), "hash-1")
    await service.recordRead(w1.sessionID, "src/a.ts")
    runtime.hashes.set(path.resolve(runtime.workspaceRoot, "src/a.ts"), "hash-2")
    const stale = await service.checkStale(w1.sessionID, ["src/a.ts"])
    expect(stale.stale).toBe(true)
    expect(stale.message).toContain("changed since you read it")
    await service.recordWrite(w1.sessionID, "src/a.ts")
    const fresh = await service.checkStale(w1.sessionID, ["src/a.ts"])
    expect(fresh.stale).toBe(false)
  })

  test("requires approval for a sub-subagent and executes it on approve", async () => {
    const { service, runtime, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Implement",
        description: "Implement",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!

    const pending = await service.spawn(w1.sessionID, { brief: "Research the API surface" })
    expect(pending.status).toBe("pending")
    expect(pending.approval?.status).toBe("pending")
    expect(pending.approval?.risk).toBe("medium")

    const listed = await service.review(rootSessionID, "list")
    expect(listed.approvals).toHaveLength(1)

    const approved = await service.review(
      rootSessionID,
      "approve",
      pending.approval!.id,
      "Safe research task",
    )
    expect(approved.approval?.status).toBe("approved")
    expect(swarm.members.size).toBe(3)
    const helper = [...swarm.members.values()].find((member) => member.role === "scout")
    expect(helper?.parentMemberID).toBe(w1.id)
    expect(helper?.depth).toBe(2)
    expect(runtime.sessions.get(helper!.sessionID)?.parentID).toBe(w1.sessionID)
    expect(runtime.synthetics.get(rootSessionID)?.length).toBeGreaterThan(0)
  })

  test("denies a pending sub-subagent without spawning", async () => {
    const { service, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Implement",
        description: "Implement",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    const pending = await service.spawn(w1.sessionID, { brief: "Research" })
    expect(pending.status).toBe("pending")
    const denied = await service.review(rootSessionID, "deny", pending.approval!.id, "Not needed")
    expect(denied.approval?.status).toBe("denied")
    expect(swarm.members.size).toBe(2)
  })

  test("stops the swarm and interrupts children", async () => {
    const { service, runtime, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Implement",
        description: "Implement",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    const stopped = await service.stopSwarm(rootSessionID, undefined, "Test stop")
    expect(stopped.stopped).toEqual([w1.id])
    expect(swarm.status).toBe("stopped")
    expect(swarm.members.get(w1.id)?.status).toBe("paused")
    expect(swarm.tasks.get(created.created[0].id)?.status).toBe("failed")
    expect(runtime.interrupted.has(w1.sessionID)).toBe(true)
  })

  test("persists and restores a paused swarm", async () => {
    const { service, runtime, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Implement",
        description: "Implement",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    await service.spawn(rootSessionID, { taskID: created.created[0].id })
    const snapshot = service.store.serialize()

    const restored = new SwarmService({
      runtime,
      config: loadConfig({
        limits: { maxMembers: 16, reviewAtMembers: 12, maxDepth: 3, maxConcurrent: 8 },
      }),
      startSupervisor: false,
    })
    const hydrated = await restored.hydrate(snapshot)
    expect(hydrated.loaded).toBe(1)
    expect(hydrated.paused).toBe(1)
    const restoredSwarm = restored.store.allSwarms()[0]
    expect(restoredSwarm.status).toBe("paused")
    expect(restoredSwarm.tasks.size).toBe(1)
    expect(restoredSwarm.members.size).toBe(2)

    const resumed = await restored.startSwarm(rootSessionID, "Test swarm goal")
    expect(resumed.resumed).toBe(true)
    expect(restoredSwarm.status).toBe("active")
  })

  test("can start a fresh swarm in the same session after the previous one finished", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Only task",
        description: "Only task",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    await service.finish(w1.sessionID, { taskID: created.created[0].id, summary: "done" })
    const first = service.memberForSession(rootSessionID)!.swarm
    expect(first.status).toBe("done")
    const second = await service.startSwarm(rootSessionID, "A completely new goal")
    expect(second.swarm.id).not.toBe(first.id)
    expect(second.swarm.status).toBe("active")
    expect(service.memberForSession(rootSessionID)!.swarm.id).toBe(second.swarm.id)
    expect(service.store.allSwarms().find((swarm) => swarm.id === first.id)?.status).toBe("done")
  })

  test("rejects a write-set expansion that conflicts with another open task", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        key: "a",
        title: "A",
        description: "A",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "A",
      },
      {
        key: "b",
        title: "B",
        description: "B",
        role: "worker",
        files: ["src/b.ts"],
        acceptance: "B",
      },
    ])
    expect(() =>
      service.updateTask(rootSessionID, created.created[1].id, {
        files: ["src/b.ts", "src/a.ts"],
      }),
    ).toThrow("Write-set conflict")
  })

  test("allows a write-set expansion when the task depends on the other", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        key: "a",
        title: "A",
        description: "A",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "A",
      },
      {
        key: "b",
        title: "B",
        description: "B",
        role: "worker",
        files: ["src/b.ts"],
        dependsOn: ["a"],
        acceptance: "B",
      },
    ])
    const updated = service.updateTask(rootSessionID, created.created[1].id, {
      files: ["src/b.ts", "src/a.ts"],
    })
    expect(updated.files).toContain("src/a.ts")
  })

  test("orchestrator task updates affect the owner, not the orchestrator", async () => {
    const { service, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Owned task",
        description: "Owned task",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    const updated = service.updateTask(rootSessionID, created.created[0].id, {
      status: "done",
      result: "closed by orchestrator",
    })
    expect(updated.status).toBe("done")
    expect(swarm.members.get(w1.id)?.status).toBe("done")
    expect(swarm.members.get("orch")?.status).not.toBe("done")
  })

  test("requires a worker to reclaim a task after the orchestrator resets it", async () => {
    const { service, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Reset me",
        description: "Reset me",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    service.updateTask(rootSessionID, created.created[0].id, {
      files: ["src/a.ts", "src/b.ts"],
      status: "todo",
    })
    expect(swarm.tasks.get(created.created[0].id)?.status).toBe("todo")
    const denied = service.checkEdit(w1.sessionID, ["src/a.ts"])
    expect(denied.deny).toBe(true)
    expect(denied.message).toContain("not currently claimed")
    const claimed = service.claimTask(w1.sessionID, created.created[0].id)
    expect(claimed.owner).toBe(w1.id)
    expect(service.checkEdit(w1.sessionID, ["src/a.ts"]).deny).toBe(false)
  })

  test("requires a task's dependencies to be done before spawning it", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        key: "first",
        title: "First",
        description: "First",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
      {
        key: "second",
        title: "Second",
        description: "Second",
        role: "worker",
        files: ["src/b.ts"],
        dependsOn: ["first"],
        acceptance: "Done",
      },
    ])
    const [first, second] = created.created
    const blocked = await service.spawn(rootSessionID, { taskID: second.id })
    expect(blocked.status).toBe("denied")
    expect(blocked.message).toContain("unfinished dependencies")
    const w1 = (await service.spawn(rootSessionID, { taskID: first.id })).member!
    await service.finish(w1.sessionID, { taskID: first.id, summary: "first done" })
    const allowed = await service.spawn(rootSessionID, { taskID: second.id })
    expect(allowed.status).toBe("spawned")
  })

  test("does not re-block a task after the token-budget guard fired once", async () => {
    const { service, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Budget task",
        description: "Budget task",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const task = created.created[0]
    const w1 = (await service.spawn(rootSessionID, { taskID: task.id })).member!
    service.config.budget.maxTokensPerTask = 1_000_000
    ;(swarm.members.get(w1.id) as { tokens: number }).tokens = 3_000_000
    ;(service as any).checkTaskBudgets(swarm)
    expect(swarm.tasks.get(task.id)?.status).toBe("blocked")
    expect(swarm.tasks.get(task.id)?.budgetBlocked).toBe(true)
    service.updateTask(rootSessionID, task.id, { status: "done", result: "verified" })
    expect(swarm.tasks.get(task.id)?.status).toBe("done")
    ;(service as any).checkTaskBudgets(swarm)
    expect(swarm.tasks.get(task.id)?.status).toBe("done")
  })

  test("wakes the orchestrator when a ready task has no owner", async () => {
    const { service, runtime, swarm, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        key: "first",
        title: "First",
        description: "First",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
      {
        key: "second",
        title: "Second",
        description: "Second",
        role: "worker",
        files: ["src/b.ts"],
        dependsOn: ["first"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    await service.finish(w1.sessionID, { taskID: created.created[0].id, summary: "first done" })
    expect(runtime.synthetics.get(rootSessionID)?.length ?? 0).toBe(0)
    ;(service as any).nudgeOrchestratorForBoard(swarm)
    expect(runtime.synthetics.get(rootSessionID)?.length ?? 0).toBe(1)
    ;(service as any).nudgeOrchestratorForBoard(swarm)
    expect(runtime.synthetics.get(rootSessionID)?.length ?? 0).toBe(1)
  })

  test("pauses the swarm when the hard budget is exceeded", async () => {
    const { service, runtime, rootSessionID } = await createReadySwarm()
    const created = await service.createTasks(rootSessionID, [
      {
        title: "Implement",
        description: "Implement",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
    ])
    const w1 = (await service.spawn(rootSessionID, { taskID: created.created[0].id })).member!
    const root = await runtime.getSession(rootSessionID)
    if (root) root.cost = 0
    const child = await runtime.getSession(w1.sessionID)
    if (child) child.cost = 10

    const report = await service.status(rootSessionID)
    expect(report.budget.paused).toBe(true)
    expect(report.status).toBe("paused")

    const denied = await service.spawn(rootSessionID, {
      title: "Another task",
      role: "worker",
    })
    expect(denied.status).toBe("denied")
    expect(denied.message).toContain("paused")
  })
})
