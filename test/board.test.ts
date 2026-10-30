import { describe, expect, test } from "bun:test"
import type { Member } from "../src/types.js"
import { createReadySwarm } from "./test-context.js"

function addWorker(
  runtime: Awaited<ReturnType<typeof createReadySwarm>>["runtime"],
  service: Awaited<ReturnType<typeof createReadySwarm>>["service"],
  swarm: Awaited<ReturnType<typeof createReadySwarm>>["swarm"],
  id: string,
  sessionID: string,
): Member {
  runtime.addSession({ id: sessionID, parentID: "root", agent: "general" })
  const member: Member = {
    id,
    swarmID: swarm.id,
    sessionID,
    parentSessionID: "root",
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
  service.store.addMember(swarm, member)
  return member
}

describe("task board", () => {
  test("creates disjoint tasks", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const result = await service.createTasks(rootSessionID, [
      {
        key: "a",
        title: "Add login",
        description: "Implement login endpoint",
        role: "worker",
        files: ["src/auth/login.ts"],
        acceptance: "Login works and has tests",
        size: "small",
      },
      {
        key: "b",
        title: "Add health",
        description: "Implement health endpoint",
        role: "worker",
        files: ["src/health.ts"],
        acceptance: "Health returns 200",
        size: "small",
      },
    ])
    expect(result.errors).toEqual([])
    expect(result.created).toHaveLength(2)
    expect(result.created.map((task) => task.id)).toEqual(["t1", "t2"])
  })

  test("rejects overlapping write-sets without a dependency", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const result = await service.createTasks(rootSessionID, [
      {
        title: "Auth module",
        description: "Build auth",
        role: "worker",
        files: ["src/auth/**"],
        acceptance: "Works",
      },
      {
        title: "Login file",
        description: "Touch login",
        role: "worker",
        files: ["src/auth/login.ts"],
        acceptance: "Works",
      },
    ])
    expect(result.created).toEqual([])
    expect(result.errors.some((error) => error.includes("Write-set conflict"))).toBe(true)
  })

  test("allows overlapping write-sets when one task depends on the other", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const result = await service.createTasks(rootSessionID, [
      {
        key: "auth",
        title: "Build auth module",
        description: "Create the module",
        role: "worker",
        files: ["src/auth/**"],
        acceptance: "Works",
      },
      {
        key: "login",
        title: "Add login route",
        description: "Use the module",
        role: "worker",
        files: ["src/auth/login.ts"],
        dependsOn: ["auth"],
        acceptance: "Works",
      },
    ])
    expect(result.errors).toEqual([])
    expect(result.created).toHaveLength(2)
    expect(result.created[1].dependsOn).toEqual([result.created[0].id])
  })

  test("rejects dependency cycles", async () => {
    const { service, rootSessionID } = await createReadySwarm()
    const result = await service.createTasks(rootSessionID, [
      {
        key: "a",
        title: "A",
        description: "A",
        role: "worker",
        files: ["src/a.ts"],
        dependsOn: ["b"],
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
    expect(result.created).toEqual([])
    expect(result.errors.some((error) => error.includes("cycle"))).toBe(true)
  })

  test("claims and completes a task", async () => {
    const { service, runtime, swarm, rootSessionID } = await createReadySwarm()
    addWorker(runtime, service, swarm, "w1", "w1s")
    const result = await service.createTasks(rootSessionID, [
      {
        title: "Implement",
        description: "Do the work",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
        size: "small",
      },
    ])
    const task = result.created[0]
    const claimed = service.claimTask("w1s", task.id)
    expect(claimed.owner).toBe("w1")
    expect(claimed.status).toBe("claimed")
    const updated = service.updateTask("w1s", task.id, { status: "done", result: "Implemented" })
    expect(updated.status).toBe("done")
    expect(swarm.members.get("w1")?.status).toBe("done")
  })

  test("blocks claiming a task with unfinished dependencies", async () => {
    const { service, runtime, swarm, rootSessionID } = await createReadySwarm()
    addWorker(runtime, service, swarm, "w1", "w1s")
    await service.createTasks(rootSessionID, [
      {
        key: "a",
        title: "First",
        description: "First",
        role: "worker",
        files: ["src/a.ts"],
        acceptance: "Done",
      },
      {
        key: "b",
        title: "Second",
        description: "Second",
        role: "worker",
        files: ["src/b.ts"],
        dependsOn: ["a"],
        acceptance: "Done",
      },
    ])
    expect(() => service.claimTask("w1s", "t2")).toThrow("unfinished dependencies")
  })
})
