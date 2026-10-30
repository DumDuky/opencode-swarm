import { describe, expect, test } from "bun:test"
import path from "node:path"
import { LeaseManager } from "../src/leases.js"
import type { Member } from "../src/types.js"
import { createReadySwarm } from "./test-context.js"

function addWorker(swarm: Awaited<ReturnType<typeof createReadySwarm>>["swarm"], id: string): Member {
  const member: Member = {
    id,
    swarmID: swarm.id,
    sessionID: `${id}s`,
    role: "worker",
    depth: 1,
    status: "idle",
    title: id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSeenAt: Date.now(),
    costUsd: 0,
    tokens: 0,
    nudgeCount: 0,
    failureHandled: false,
  }
  swarm.members.set(id, member)
  return member
}

describe("file leases", () => {
  test("grants an exact file lease and rejects a conflicting writer", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    addWorker(swarm, "w2")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    const first = leases.claim("w1", ["src/a.ts"], 60_000)
    expect(first.ok).toBe(true)
    const conflict = leases.claim("w2", ["src/a.ts"], 60_000)
    expect(conflict.ok).toBe(false)
    expect(conflict.conflicts[0].existing.owner).toBe("w1")
  })

  test("supports reentrant claims by the same owner", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    expect(leases.claim("w1", ["src/a.ts"], 60_000).ok).toBe(true)
    expect(leases.claim("w1", ["src/a.ts"], 60_000).ok).toBe(true)
    expect(leases.list("w1")).toHaveLength(1)
  })

  test("directory leases conflict with files inside them", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    addWorker(swarm, "w2")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    expect(leases.claim("w1", ["src/auth/**"], 60_000).ok).toBe(true)
    const conflict = leases.claim("w2", ["src/auth/login.ts"], 60_000)
    expect(conflict.ok).toBe(false)
    const reverse = leases.claim("w2", ["src/**"], 60_000)
    expect(reverse.ok).toBe(false)
  })

  test("is atomic when any requested path conflicts", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    addWorker(swarm, "w2")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    expect(leases.claim("w1", ["src/a.ts"], 60_000).ok).toBe(true)
    const result = leases.claim("w2", ["src/b.ts", "src/a.ts"], 60_000)
    expect(result.ok).toBe(false)
    expect(leases.list("w2")).toHaveLength(0)
  })

  test("releases leases", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    leases.claim("w1", ["src/a.ts"], 60_000)
    const released = leases.release("w1")
    expect(released).toHaveLength(1)
    expect(leases.list()).toHaveLength(0)
  })

  test("expires leases", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    leases.claim("w1", ["src/a.ts"], 10)
    expect(leases.list()).toHaveLength(1)
    const expired = leases.expire(Date.now() + 1000)
    expect(expired).toHaveLength(1)
    expect(leases.list()).toHaveLength(0)
  })

  test("detects stale reads and updates the hash after a write", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    leases.recordRead("w1", "src/a.ts", "hash-1")
    expect(leases.checkStale("w1", "src/a.ts", "hash-2").stale).toBe(true)
    leases.recordWrite("w1", "src/a.ts", "hash-2")
    expect(leases.checkStale("w1", "src/a.ts", "hash-2").stale).toBe(false)
    expect(leases.checkStale("w1", "src/a.ts", "hash-3").stale).toBe(true)
  })

  test("normalizes absolute paths inside the workspace", async () => {
    const { swarm, runtime } = await createReadySwarm()
    addWorker(swarm, "w1")
    addWorker(swarm, "w2")
    const leases = new LeaseManager(swarm, runtime.workspaceRoot)
    const absolute = path.resolve(runtime.workspaceRoot, "src/a.ts")
    expect(leases.claim("w1", [absolute], 60_000).ok).toBe(true)
    expect(leases.claim("w2", ["src/a.ts"], 60_000).ok).toBe(false)
  })
})
