import { readFile } from "node:fs/promises"
import path from "node:path"
import { loadConfig } from "../config.js"
import type { SwarmConfig } from "../types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function merge(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) return override === undefined ? base : override
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    result[key] = isRecord(result[key]) && isRecord(value) ? merge(result[key], value) : value
  }
  return result
}

const V1_AGENTS = {
  orchestrator: "swarm",
  worker: "swarm-worker",
  scout: "swarm-scout",
  reviewer: "swarm-reviewer",
  planner: "swarm-planner",
  tester: "swarm-tester",
  integrator: "swarm-integrator",
} as const

export async function loadV1Config(
  options: Record<string, unknown> | undefined,
  directory: string,
): Promise<SwarmConfig> {
  let fileConfig: Record<string, unknown> = {}
  try {
    const content = await readFile(path.join(directory, "swarm.config.json"), "utf8")
    const parsed = JSON.parse(content)
    if (isRecord(parsed)) fileConfig = parsed
  } catch {
    // A config file is optional.
  }
  const merged = merge(fileConfig, options ?? {}) as Record<string, unknown>
  const config = loadConfig(merged)
  const explicitAgents = isRecord(merged.agents) ? merged.agents : {}
  for (const [role, agent] of Object.entries(V1_AGENTS)) {
    if (typeof explicitAgents[role] !== "string") {
      ;(config.agents as Record<string, string>)[role] = agent
    }
  }
  return config
}
