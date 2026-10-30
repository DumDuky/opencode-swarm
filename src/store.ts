import type {
  Approval,
  HiveCounters,
  Lease,
  Member,
  MemberID,
  Message,
  Role,
  Swarm,
  SwarmID,
  Task,
} from "./types.js"
import { now, randomID } from "./util.js"

const SNAPSHOT_VERSION = 1

interface Snapshot {
  version: number
  swarms: Array<{
    id: SwarmID
    goal: string
    rootSessionID: string
    orchestratorMemberID: MemberID
    status: Swarm["status"]
    createdAt: number
    updatedAt: number
    version: number
    members: Member[]
    tasks: Task[]
    messages: Message[]
    leases: Lease[]
    approvals: Approval[]
    counters: HiveCounters
    budget: Swarm["budget"]
    concurrencyLimit: number
    retryUntil?: number
    stoppedReason?: string
  }>
}

export interface FoundMember {
  swarm: Swarm
  member: Member
}

export class SwarmStore {
  readonly swarms = new Map<SwarmID, Swarm>()
  private sessionIndex = new Map<string, { swarmID: SwarmID; memberID: MemberID }>()

  createSwarm(input: {
    rootSessionID: string
    goal: string
    orchestrator: Member
    concurrencyLimit: number
  }): Swarm {
    const timestamp = now()
    const swarm: Swarm = {
      id: randomID("sw"),
      goal: input.goal.trim(),
      rootSessionID: input.rootSessionID,
      orchestratorMemberID: input.orchestrator.id,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      members: new Map(),
      tasks: new Map(),
      messages: [],
      leases: new Map(),
      approvals: new Map(),
      counters: { member: 0, task: 0, message: 0, approval: 0, lease: 0 },
      budget: { spentUsd: 0, tokens: 0, paused: false },
      concurrencyLimit: input.concurrencyLimit,
    }
    input.orchestrator.swarmID = swarm.id
    swarm.members.set(input.orchestrator.id, input.orchestrator)
    this.swarms.set(swarm.id, swarm)
    this.sessionIndex.set(input.rootSessionID, {
      swarmID: swarm.id,
      memberID: input.orchestrator.id,
    })
    return swarm
  }

  addMember(swarm: Swarm, member: Member): void {
    swarm.members.set(member.id, member)
    this.sessionIndex.set(member.sessionID, { swarmID: swarm.id, memberID: member.id })
    swarm.version++
    swarm.updatedAt = now()
  }

  removeMember(swarm: Swarm, memberID: MemberID): void {
    const member = swarm.members.get(memberID)
    if (member) this.sessionIndex.delete(member.sessionID)
    swarm.members.delete(memberID)
    swarm.version++
    swarm.updatedAt = now()
  }

  findBySession(sessionID: string): FoundMember | undefined {
    const location = this.sessionIndex.get(sessionID)
    if (!location) return undefined
    const swarm = this.swarms.get(location.swarmID)
    const member = swarm?.members.get(location.memberID)
    if (!swarm || !member) return undefined
    return { swarm, member }
  }

  findMember(swarm: Swarm, memberID: MemberID): Member | undefined {
    return swarm.members.get(memberID)
  }

  findByMemberID(swarmID: SwarmID, memberID: MemberID): Member | undefined {
    return this.swarms.get(swarmID)?.members.get(memberID)
  }

  activeSwarms(): Swarm[] {
    return [...this.swarms.values()].filter((swarm) => swarm.status === "active" || swarm.status === "paused")
  }

  allSwarms(): Swarm[] {
    return [...this.swarms.values()]
  }

  nextMemberID(swarm: Swarm, role: Role): MemberID {
    const prefix =
      role === "orchestrator"
        ? "orch"
        : role === "worker"
          ? "w"
          : role === "scout"
            ? "s"
            : role === "reviewer"
              ? "r"
              : role === "tester"
                ? "q"
                : role === "planner"
                  ? "p"
                  : "i"
    for (let attempt = 0; attempt < 10_000; attempt++) {
      const id = `${prefix}${++swarm.counters.member}`
      if (!swarm.members.has(id)) return id
    }
    return `${prefix}${Date.now().toString(36)}`
  }

  serialize(): Snapshot {
    return {
      version: SNAPSHOT_VERSION,
      swarms: [...this.swarms.values()].map((swarm) => ({
        id: swarm.id,
        goal: swarm.goal,
        rootSessionID: swarm.rootSessionID,
        orchestratorMemberID: swarm.orchestratorMemberID,
        status: swarm.status,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        version: swarm.version,
        members: [...swarm.members.values()],
        tasks: [...swarm.tasks.values()],
        messages: swarm.messages,
        leases: [...swarm.leases.values()],
        approvals: [...swarm.approvals.values()],
        counters: swarm.counters,
        budget: swarm.budget,
        concurrencyLimit: swarm.concurrencyLimit,
        retryUntil: swarm.retryUntil,
        stoppedReason: swarm.stoppedReason,
      })),
    }
  }

  hydrate(snapshot: unknown): { loaded: number; paused: number } {
    if (!snapshot || typeof snapshot !== "object") return { loaded: 0, paused: 0 }
    const data = snapshot as Partial<Snapshot>
    if (data.version !== SNAPSHOT_VERSION || !Array.isArray(data.swarms)) {
      return { loaded: 0, paused: 0 }
    }
    let loaded = 0
    let paused = 0
    for (const entry of data.swarms) {
      if (!entry?.id || !entry.rootSessionID) continue
      const swarm: Swarm = {
        id: entry.id,
        goal: entry.goal ?? "",
        rootSessionID: entry.rootSessionID,
        orchestratorMemberID: entry.orchestratorMemberID,
        status: entry.status === "active" ? "paused" : entry.status ?? "paused",
        createdAt: entry.createdAt ?? now(),
        updatedAt: entry.updatedAt ?? now(),
        version: entry.version ?? 1,
        members: new Map((entry.members ?? []).map((member) => [member.id, member])),
        tasks: new Map((entry.tasks ?? []).map((task) => [task.id, task])),
        messages: Array.isArray(entry.messages) ? entry.messages : [],
        leases: new Map((entry.leases ?? []).map((lease) => [lease.id, lease])),
        approvals: new Map((entry.approvals ?? []).map((approval) => [approval.id, approval])),
        counters: entry.counters ?? { member: 0, task: 0, message: 0, approval: 0, lease: 0 },
        budget: entry.budget ?? { spentUsd: 0, tokens: 0, paused: false },
        concurrencyLimit: entry.concurrencyLimit ?? 4,
        retryUntil: entry.retryUntil,
        stoppedReason: entry.stoppedReason,
      }
      if (entry.status === "active" || entry.status === "paused") {
        swarm.status = "paused"
        paused++
      }
      this.swarms.set(swarm.id, swarm)
      for (const member of swarm.members.values()) {
        this.sessionIndex.set(member.sessionID, { swarmID: swarm.id, memberID: member.id })
      }
      loaded++
    }
    return { loaded, paused }
  }
}
