import { describe, expect, test } from "bun:test"
import { Bus } from "../src/bus.js"
import type { Member } from "../src/types.js"
import { createReadySwarm } from "./test-context.js"

function addWorker(
  swarm: Awaited<ReturnType<typeof createReadySwarm>>["swarm"],
  id: string,
): Member {
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

describe("message bus", () => {
  test("sends and reads direct messages", async () => {
    const { swarm } = await createReadySwarm()
    addWorker(swarm, "w1")
    const bus = new Bus(swarm)
    const message = bus.send(
      { from: "orch", to: "w1", kind: "note", body: "hello" },
      4000,
      30,
    )
    expect(message.id).toBe("m1")
    expect(bus.unreadCount("w1")).toBe(1)
    const read = bus.read("w1")
    expect(read).toHaveLength(1)
    expect(read[0].body).toBe("hello")
    expect(bus.unreadCount("w1")).toBe(0)
  })

  test("broadcasts are visible to every member", async () => {
    const { swarm } = await createReadySwarm()
    addWorker(swarm, "w1")
    addWorker(swarm, "w2")
    const bus = new Bus(swarm)
    bus.send({ from: "orch", to: "broadcast", body: "all hands" }, 4000, 30)
    expect(bus.read("w1")[0].body).toBe("all hands")
    expect(bus.read("w2")[0].body).toBe("all hands")
  })

  test("waits for a message and resolves when one arrives", async () => {
    const { swarm } = await createReadySwarm()
    addWorker(swarm, "w1")
    const bus = new Bus(swarm)
    const promise = bus.wait("w1", 2000)
    setTimeout(() => {
      bus.send({ from: "orch", to: "w1", kind: "question", body: "are you there?" }, 4000, 30)
    }, 20)
    const message = await promise
    expect(message?.body).toBe("are you there?")
    expect(bus.unreadCount("w1")).toBe(0)
  })

  test("enforces the per-minute rate limit", async () => {
    const { swarm } = await createReadySwarm()
    addWorker(swarm, "w1")
    const bus = new Bus(swarm)
    bus.send({ from: "orch", to: "w1", body: "one" }, 4000, 2)
    bus.send({ from: "orch", to: "w1", body: "two" }, 4000, 2)
    expect(() => bus.send({ from: "orch", to: "w1", body: "three" }, 4000, 2)).toThrow("Rate limit")
  })

  test("drops repeated identical messages", async () => {
    const { swarm } = await createReadySwarm()
    addWorker(swarm, "w1")
    const bus = new Bus(swarm)
    bus.send({ from: "orch", to: "w1", body: "same" }, 4000, 30)
    bus.send({ from: "orch", to: "w1", body: "same" }, 4000, 30)
    bus.send({ from: "orch", to: "w1", body: "same" }, 4000, 30)
    expect(() => bus.send({ from: "orch", to: "w1", body: "same" }, 4000, 30)).toThrow(
      "Repeated identical message",
    )
  })

  test("rejects self-addressed notes but allows status", async () => {
    const { swarm } = await createReadySwarm()
    addWorker(swarm, "w1")
    const bus = new Bus(swarm)
    expect(() => bus.send({ from: "w1", to: "w1", kind: "note", body: "self" }, 4000, 30)).toThrow(
      "yourself",
    )
    expect(() => bus.send({ from: "w1", to: "w1", kind: "status", body: "status" }, 4000, 30)).not.toThrow()
  })
})
