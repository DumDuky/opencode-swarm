import { describe, expect, test } from "bun:test"
import { loadConfig } from "../src/config.js"
import { PolicyEngine } from "../src/policy.js"
import type { Member, Role } from "../src/types.js"

function member(role: Role, id = "m1"): Member {
  return {
    id,
    swarmID: "sw1",
    sessionID: `${id}s`,
    role,
    depth: role === "orchestrator" ? 0 : 1,
    status: "idle",
    title: id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSeenAt: Date.now(),
    costUsd: 0,
    tokens: 0,
    nudgeCount: 0,
  }
}

function spawnInput(overrides: Partial<Parameters<PolicyEngine["spawn"]>[0]> = {}) {
  return {
    requester: member("orchestrator"),
    targetRole: "worker" as Role,
    targetDepth: 1,
    memberCount: 1,
    activeCount: 1,
    recentSpawns: 0,
    budgetRatio: 0,
    ...overrides,
  }
}

describe("policy", () => {
  test("allows a normal first-level spawn", () => {
    const policy = new PolicyEngine(loadConfig({}))
    expect(policy.spawn(spawnInput()).decision).toBe("allow")
  })

  test("reviews sub-subagents", () => {
    const policy = new PolicyEngine(loadConfig({}))
    const decision = policy.spawn(spawnInput({ targetDepth: 2 }))
    expect(decision.decision).toBe("review")
    expect(decision.reason).toContain("sub-subagent")
  })

  test("denies over the member cap", () => {
    const policy = new PolicyEngine(loadConfig({ limits: { maxMembers: 3, reviewAtMembers: 2 } }))
    const decision = policy.spawn(spawnInput({ memberCount: 3 }))
    expect(decision.decision).toBe("deny")
  })

  test("reviews at the review threshold", () => {
    const policy = new PolicyEngine(loadConfig({ limits: { maxMembers: 10, reviewAtMembers: 3 } }))
    expect(policy.spawn(spawnInput({ memberCount: 3 })).decision).toBe("review")
  })

  test("denies over the concurrency cap", () => {
    const policy = new PolicyEngine(loadConfig({ limits: { maxConcurrent: 2 } }))
    expect(policy.spawn(spawnInput({ activeCount: 2 })).decision).toBe("deny")
  })

  test("denies when the budget is paused", () => {
    const policy = new PolicyEngine(loadConfig({ budget: { pauseAt: 0.9 } }))
    expect(policy.spawn(spawnInput({ budgetRatio: 0.95 })).decision).toBe("deny")
  })

  test("reviews when the budget warning threshold is crossed", () => {
    const policy = new PolicyEngine(loadConfig({ budget: { warnAt: 0.7, pauseAt: 0.9 } }))
    expect(policy.spawn(spawnInput({ budgetRatio: 0.75 })).decision).toBe("review")
  })

  test("denies large tasks", () => {
    const policy = new PolicyEngine(loadConfig({}))
    expect(policy.spawn(spawnInput({ taskSize: "large" })).decision).toBe("deny")
  })

  test("reviews worker spawns in strict mode", () => {
    const policy = new PolicyEngine(loadConfig({ approval: { mode: "strict" } }))
    expect(policy.spawn(spawnInput({ requester: member("worker") })).decision).toBe("review")
  })

  test("classifies shell commands", () => {
    const policy = new PolicyEngine(loadConfig({}))
    expect(policy.shell("rm -rf /").decision).toBe("deny")
    expect(policy.shell("git push --force").decision).toBe("ask")
    expect(policy.shell("echo hello").decision).toBe("allow")
    expect(policy.shell("echo hi > out.txt").risk).toBe("medium")
  })

  test("applies timeout defaults", () => {
    const policy = new PolicyEngine(loadConfig({}))
    expect(policy.timeoutDecision("medium")).toBe("allow")
    expect(policy.timeoutDecision("high")).toBe("deny")
  })
})
