export type SwarmID = string
export type MemberID = string
export type TaskID = string
export type MessageID = string
export type ApprovalID = string
export type LeaseID = string

export type SwarmStatus = "active" | "paused" | "done" | "stopped"
export type Role =
  | "orchestrator"
  | "worker"
  | "scout"
  | "reviewer"
  | "tester"
  | "integrator"
  | "planner"

export type MemberStatus =
  | "starting"
  | "idle"
  | "working"
  | "blocked"
  | "waiting_approval"
  | "done"
  | "failed"
  | "lost"
  | "paused"

export type TaskStatus =
  | "todo"
  | "claimed"
  | "working"
  | "blocked"
  | "review"
  | "done"
  | "failed"

export type MessageKind =
  | "note"
  | "question"
  | "answer"
  | "status"
  | "request"
  | "result"

export type MessagePriority = "low" | "normal" | "high"

export type Risk = "low" | "medium" | "high" | "critical"

export type ApprovalKind = "spawn" | "file" | "budget" | "shell"
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "cancelled"

export interface ModelRef {
  providerID: string
  id: string
  variant?: string
}

export interface SwarmConfig {
  models: {
    orchestrator: string
    worker: string
    scout: string
    reviewer: string
    planner: string
    tester: string
    integrator: string
  }
  agents: {
    orchestrator: string
    worker: string
    scout: string
    reviewer: string
    planner: string
    tester: string
    integrator: string
  }
  limits: {
    maxMembers: number
    reviewAtMembers: number
    maxDepth: number
    maxConcurrent: number
    maxMessagesPerMinute: number
    maxMessageLength: number
    maxTaskAttempts: number
  }
  budget: {
    maxCostUsd: number
    maxTokensPerTask: number
    warnAt: number
    pauseAt: number
  }
  leases: {
    ttlMs: number
    autoClaim: boolean
  }
  approval: {
    mode: "permissive" | "balanced" | "strict"
    timeoutMs: number
    onTimeoutMedium: "allow" | "deny"
    onTimeoutHigh: "allow" | "deny"
  }
  workspace: {
    mode: "shared"
  }
  supervisor: {
    intervalMs: number
    idleNudgeMs: number
    digestThrottleMs: number
  }
}

export interface Member {
  id: MemberID
  swarmID: SwarmID
  sessionID: string
  parentSessionID?: string
  parentMemberID?: MemberID
  role: Role
  depth: number
  status: MemberStatus
  title: string
  taskID?: TaskID
  agent?: string
  model?: ModelRef
  createdAt: number
  updatedAt: number
  lastSeenAt: number
  costUsd: number
  tokens: number
  error?: string
  nudgeCount: number
  failureHandled?: boolean
}

export interface Task {
  id: TaskID
  swarmID: SwarmID
  key?: string
  title: string
  description: string
  role: Role
  status: TaskStatus
  owner?: MemberID
  files: string[]
  dependsOn: TaskID[]
  acceptance: string
  size: "small" | "medium" | "large"
  result?: string
  blockers?: string
  attempts: number
  budgetBlocked?: boolean
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
}

export interface Message {
  id: MessageID
  swarmID: SwarmID
  from: MemberID
  to: MemberID | "broadcast"
  kind: MessageKind
  priority: MessagePriority
  body: string
  replyTo?: MessageID
  createdAt: number
  readBy: MemberID[]
}

export interface Lease {
  id: LeaseID
  swarmID: SwarmID
  path: string
  directory: boolean
  owner: MemberID
  taskID?: TaskID
  createdAt: number
  updatedAt: number
  expiresAt: number
}

export interface Approval {
  id: ApprovalID
  swarmID: SwarmID
  kind: ApprovalKind
  risk: Risk
  requester: MemberID
  requesterSessionID: string
  summary: string
  reason: string
  payload: Record<string, unknown>
  status: ApprovalStatus
  createdAt: number
  updatedAt: number
  resolvedAt?: number
  resolvedBy?: MemberID | "human" | "timeout"
  decisionReason?: string
}

export interface HiveCounters {
  member: number
  task: number
  message: number
  approval: number
  lease: number
}

export interface BudgetState {
  spentUsd: number
  tokens: number
  paused: boolean
  pauseReason?: string
}

export interface Swarm {
  id: SwarmID
  goal: string
  rootSessionID: string
  orchestratorMemberID: MemberID
  status: SwarmStatus
  createdAt: number
  updatedAt: number
  version: number
  members: Map<MemberID, Member>
  tasks: Map<TaskID, Task>
  messages: Message[]
  leases: Map<LeaseID, Lease>
  approvals: Map<ApprovalID, Approval>
  counters: HiveCounters
  budget: BudgetState
  concurrencyLimit: number
  retryUntil?: number
  stoppedReason?: string
}

export interface SpawnPayload {
  requesterMemberID: MemberID
  requesterSessionID: string
  taskID?: TaskID
  role: Role
  model?: string
  agent?: string
  title?: string
  brief?: string
}

export interface WaitTarget {
  memberID: MemberID
  status: MemberStatus
  taskID?: TaskID
  taskStatus?: TaskStatus
  summary?: string
  error?: string
}

export interface StatusReport {
  swarmID: SwarmID
  goal: string
  status: SwarmStatus
  you: {
    memberID: MemberID
    role: Role
    depth: number
    taskID?: TaskID
  }
  members: Array<{
    id: MemberID
    role: Role
    status: MemberStatus
    taskID?: TaskID
    taskTitle?: string
    depth: number
    costUsd: number
    title: string
  }>
  tasks: Array<{
    id: TaskID
    title: string
    status: TaskStatus
    owner?: MemberID
    files: string[]
    dependsOn: TaskID[]
    attempts: number
  }>
  leases: Array<{
    path: string
    directory: boolean
    owner: MemberID
    taskID?: TaskID
    expiresAt: number
  }>
  approvals: Array<{
    id: ApprovalID
    kind: ApprovalKind
    risk: Risk
    requester: MemberID
    summary: string
    status: ApprovalStatus
  }>
  budget: BudgetState & { maxCostUsd: number; maxTokensPerTask: number }
  unreadMessages: number
}
