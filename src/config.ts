import type { Role, SwarmConfig } from "./types.js"

export const DEFAULT_CONFIG: SwarmConfig = {
  models: {
    orchestrator: "opencode-go/deepseek-v4.1-flash",
    worker: "opencode-go/deepseek-v4.1-flash",
    scout: "opencode-go/deepseek-v4.1-flash#low",
    reviewer: "opencode-go/deepseek-v4.1-flash#high",
    planner: "opencode-go/deepseek-v4.1-flash#high",
    tester: "opencode-go/deepseek-v4.1-flash",
    integrator: "opencode-go/deepseek-v4.1-flash#high",
  },
  agents: {
    orchestrator: "build",
    worker: "general",
    scout: "explore",
    reviewer: "general",
    planner: "explore",
    tester: "general",
    integrator: "general",
  },
  limits: {
    maxMembers: 8,
    reviewAtMembers: 6,
    maxDepth: 2,
    maxConcurrent: 4,
    maxMessagesPerMinute: 10,
    maxMessageLength: 4000,
    maxTaskAttempts: 2,
  },
  budget: {
    maxCostUsd: 3,
    maxTokensPerTask: 0,
    warnAt: 0.7,
    pauseAt: 0.9,
  },
  leases: {
    ttlMs: 600_000,
    autoClaim: true,
  },
  approval: {
    mode: "balanced",
    timeoutMs: 120_000,
    onTimeoutMedium: "allow",
    onTimeoutHigh: "deny",
  },
  workspace: {
    mode: "shared",
  },
  supervisor: {
    intervalMs: 3_000,
    idleNudgeMs: 120_000,
    digestThrottleMs: 5_000,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) {
    return (override === undefined ? base : override) as T
  }
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const current = result[key]
    result[key] = isRecord(current) && isRecord(value) ? deepMerge(current, value) : value
  }
  return result as T
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback
}

export function loadConfig(options: unknown): SwarmConfig {
  const merged = deepMerge(DEFAULT_CONFIG, options)
  const config: SwarmConfig = {
    ...merged,
    models: {
      orchestrator: stringOr(merged.models?.orchestrator, DEFAULT_CONFIG.models.orchestrator),
      worker: stringOr(merged.models?.worker, DEFAULT_CONFIG.models.worker),
      scout: stringOr(merged.models?.scout, DEFAULT_CONFIG.models.scout),
      reviewer: stringOr(merged.models?.reviewer, DEFAULT_CONFIG.models.reviewer),
      planner: stringOr(merged.models?.planner, DEFAULT_CONFIG.models.planner),
      tester: stringOr(merged.models?.tester, DEFAULT_CONFIG.models.tester),
      integrator: stringOr(merged.models?.integrator, DEFAULT_CONFIG.models.integrator),
    },
    agents: {
      orchestrator: stringOr(merged.agents?.orchestrator, DEFAULT_CONFIG.agents.orchestrator),
      worker: stringOr(merged.agents?.worker, DEFAULT_CONFIG.agents.worker),
      scout: stringOr(merged.agents?.scout, DEFAULT_CONFIG.agents.scout),
      reviewer: stringOr(merged.agents?.reviewer, DEFAULT_CONFIG.agents.reviewer),
      planner: stringOr(merged.agents?.planner, DEFAULT_CONFIG.agents.planner),
      tester: stringOr(merged.agents?.tester, DEFAULT_CONFIG.agents.tester),
      integrator: stringOr(merged.agents?.integrator, DEFAULT_CONFIG.agents.integrator),
    },
    limits: {
      maxMembers: numberInRange(merged.limits?.maxMembers, DEFAULT_CONFIG.limits.maxMembers, 1, 64),
      reviewAtMembers: numberInRange(
        merged.limits?.reviewAtMembers,
        DEFAULT_CONFIG.limits.reviewAtMembers,
        1,
        64,
      ),
      maxDepth: numberInRange(merged.limits?.maxDepth, DEFAULT_CONFIG.limits.maxDepth, 0, 10),
      maxConcurrent: numberInRange(
        merged.limits?.maxConcurrent,
        DEFAULT_CONFIG.limits.maxConcurrent,
        1,
        32,
      ),
      maxMessagesPerMinute: numberInRange(
        merged.limits?.maxMessagesPerMinute,
        DEFAULT_CONFIG.limits.maxMessagesPerMinute,
        1,
        120,
      ),
      maxMessageLength: numberInRange(
        merged.limits?.maxMessageLength,
        DEFAULT_CONFIG.limits.maxMessageLength,
        200,
        20_000,
      ),
      maxTaskAttempts: numberInRange(
        merged.limits?.maxTaskAttempts,
        DEFAULT_CONFIG.limits.maxTaskAttempts,
        1,
        10,
      ),
    },
    budget: {
      maxCostUsd: numberInRange(merged.budget?.maxCostUsd, DEFAULT_CONFIG.budget.maxCostUsd, 0.01, 10_000),
      maxTokensPerTask: numberInRange(
        merged.budget?.maxTokensPerTask,
        DEFAULT_CONFIG.budget.maxTokensPerTask,
        0,
        100_000_000,
      ),
      warnAt: numberInRange(merged.budget?.warnAt, DEFAULT_CONFIG.budget.warnAt, 0.05, 1),
      pauseAt: numberInRange(merged.budget?.pauseAt, DEFAULT_CONFIG.budget.pauseAt, 0.05, 1),
    },
    leases: {
      ttlMs: numberInRange(merged.leases?.ttlMs, DEFAULT_CONFIG.leases.ttlMs, 10_000, 24 * 60 * 60_000),
      autoClaim: merged.leases?.autoClaim !== false,
    },
    approval: {
      mode:
        merged.approval?.mode === "permissive" || merged.approval?.mode === "strict"
          ? merged.approval.mode
          : "balanced",
      timeoutMs: numberInRange(
        merged.approval?.timeoutMs,
        DEFAULT_CONFIG.approval.timeoutMs,
        1_000,
        60 * 60_000,
      ),
      onTimeoutMedium: merged.approval?.onTimeoutMedium === "deny" ? "deny" : "allow",
      onTimeoutHigh: merged.approval?.onTimeoutHigh === "allow" ? "allow" : "deny",
    },
    workspace: {
      mode: "shared",
    },
    supervisor: {
      intervalMs: numberInRange(
        merged.supervisor?.intervalMs,
        DEFAULT_CONFIG.supervisor.intervalMs,
        500,
        60_000,
      ),
      idleNudgeMs: numberInRange(
        merged.supervisor?.idleNudgeMs,
        DEFAULT_CONFIG.supervisor.idleNudgeMs,
        10_000,
        60 * 60_000,
      ),
      digestThrottleMs: numberInRange(
        merged.supervisor?.digestThrottleMs,
        DEFAULT_CONFIG.supervisor.digestThrottleMs,
        1_000,
        60_000,
      ),
    },
  }
  if (config.limits.reviewAtMembers > config.limits.maxMembers) {
    config.limits.reviewAtMembers = config.limits.maxMembers
  }
  if (config.budget.pauseAt < config.budget.warnAt) {
    config.budget.pauseAt = config.budget.warnAt
  }
  return config
}

export interface RoleTarget {
  role: Role
  model: string
  agent: string
}

export function roleTarget(config: SwarmConfig, role: Role): RoleTarget {
  switch (role) {
    case "orchestrator":
      return { role, model: config.models.orchestrator, agent: config.agents.orchestrator }
    case "scout":
      return { role, model: config.models.scout, agent: config.agents.scout }
    case "reviewer":
      return { role, model: config.models.reviewer, agent: config.agents.reviewer }
    case "tester":
      return { role, model: config.models.tester, agent: config.agents.tester }
    case "integrator":
      return { role, model: config.models.integrator, agent: config.agents.integrator }
    default:
      return { role, model: config.models.worker, agent: config.agents.worker }
  }
}
