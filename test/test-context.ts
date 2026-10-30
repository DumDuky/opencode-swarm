import { describe, expect, test } from "bun:test"
import { loadConfig } from "../src/config.js"
import { SwarmService } from "../src/service.js"
import { FakeRuntime } from "./fake-runtime.js"

export interface TestContext {
  runtime: FakeRuntime
  service: SwarmService
  rootSessionID: string
}

export function createTestContext(): TestContext {
  const runtime = new FakeRuntime()
  const config = loadConfig({
    limits: {
      maxMembers: 16,
      reviewAtMembers: 12,
      maxDepth: 3,
      maxConcurrent: 8,
      maxMessagesPerMinute: 30,
    },
    supervisor: { intervalMs: 60_000, idleNudgeMs: 60_000 },
  })
  const service = new SwarmService({
    runtime,
    config,
    startSupervisor: false,
  })
  runtime.addSession({
    id: "root",
    title: "Root",
    agent: "build",
    metadata: { existing: "keep" },
  })
  return { runtime, service, rootSessionID: "root" }
}

export async function createReadySwarm() {
  const context = createTestContext()
  const started = await context.service.startSwarm(context.rootSessionID, "Test swarm goal")
  return { ...context, swarm: started.swarm, orchestrator: started.member }
}

describe("test harness", () => {
  test("starts a swarm and preserves metadata", async () => {
    const { service, runtime, rootSessionID, swarm } = await createReadySwarm()
    const root = await runtime.getSession(rootSessionID)
    expect(swarm.goal).toBe("Test swarm goal")
    expect(root?.metadata?.["swarm.id"]).toBe(swarm.id)
    expect(root?.metadata?.existing).toBe("keep")
    expect(service.memberForSession(rootSessionID)?.member.role).toBe("orchestrator")
  })
})
