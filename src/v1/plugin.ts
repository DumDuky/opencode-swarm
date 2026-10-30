import type { Config, Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { fileURLToPath } from "node:url"
import { errorMessage } from "../errors.js"
import { SwarmService } from "../service.js"
import { v1Agents, v1Commands } from "./agents.js"
import { loadV1Config } from "./config.js"
import {
  editTool,
  normalizeV1Event,
  readTool,
  shellCommand,
  shellTool,
  toolPaths,
} from "./events.js"
import { createV1Runtime } from "./runtime.js"
import { appendV1Audit, readV1State, writeV1State } from "./state.js"
import { createV1Tools } from "./tools.js"

const SWARM_INSTRUCTIONS = fileURLToPath(new URL("../../docs/SWARM.md", import.meta.url))

export const v1Plugin: Plugin = async (
  input: PluginInput,
  options?: PluginOptions,
): Promise<Hooks> => {
  const projectRoot = input.directory
  const swarmConfig = await loadV1Config(options, projectRoot)
  const runtime = createV1Runtime(input)
  const service = new SwarmService({
    runtime,
    config: swarmConfig,
    onStateChanged: async (snapshot) => {
      await writeV1State(projectRoot, snapshot)
    },
    onNotice: (message) => {
      console.error("[swarm]", message)
      void appendV1Audit(projectRoot, message)
    },
  })

  try {
    const hydrated = await service.hydrate(await readV1State(projectRoot))
    if (hydrated.loaded > 0) {
      console.error(
        `[swarm] restored ${hydrated.loaded} swarm(s); ${hydrated.paused} paused. Use /swarm in the root session to resume.`,
      )
    }
  } catch (error) {
    console.error("[swarm] could not restore state:", errorMessage(error))
  }

  return {
    tool: createV1Tools(service),
    async event({ event }) {
      await service.handleEvent(normalizeV1Event(event))
    },
    async config(config: Config) {
      const agents = v1Agents(swarmConfig)
      config.agent = { ...(config.agent ?? {}) }
      for (const [id, agent] of Object.entries(agents)) {
        config.agent[id] = { ...agent, ...(config.agent[id] ?? {}) }
      }
      config.command = { ...(config.command ?? {}) }
      for (const [name, command] of Object.entries(v1Commands())) {
        if (!config.command[name]) config.command[name] = command
      }
      config.instructions = [...(config.instructions ?? [])]
      if (!config.instructions.includes(SWARM_INSTRUCTIONS)) {
        config.instructions.push(SWARM_INSTRUCTIONS)
      }
    },
    async "experimental.chat.system.transform"(hookInput, output) {
      if (!hookInput.sessionID) return
      const digest = service.digest(hookInput.sessionID)
      if (digest) output.system.push(digest)
    },
    async "tool.execute.before"(hookInput, output) {
      const found = service.memberForSession(hookInput.sessionID)
      if (!found) return
      if (hookInput.tool === "task") {
        throw new Error(
          "[swarm] The built-in task/subagent tool is disabled in swarm sessions. Use swarm_spawn so the spawn is tracked and governed.",
        )
      }
      const files = toolPaths(hookInput.tool, output.args)
      if (editTool(hookInput.tool) && files.length > 0) {
        const check = service.checkEdit(hookInput.sessionID, files)
        if (check.deny) throw new Error(`[swarm] ${check.message}`)
        const stale = await service.checkStale(hookInput.sessionID, files)
        if (stale.stale) throw new Error(`[swarm] ${stale.message}`)
      }
      if (shellTool(hookInput.tool)) {
        const command = shellCommand(output.args)
        if (command) {
          const check = service.checkShell(hookInput.sessionID, command)
          if (check.effect === "deny") throw new Error(`[swarm] ${check.message ?? "Shell command blocked."}`)
          if (check.effect === "ask" && found.member.role !== "orchestrator") {
            throw new Error(
              `[swarm] High-impact shell command requires orchestrator approval. Ask the orchestrator with swarm_message, or let the orchestrator run it. Command: ${command}`,
            )
          }
        }
      }
    },
    async "tool.execute.after"(hookInput) {
      const files = toolPaths(hookInput.tool, hookInput.args)
      if (files.length === 0) return
      if (readTool(hookInput.tool)) {
        for (const file of files) await service.recordRead(hookInput.sessionID, file)
      } else if (editTool(hookInput.tool)) {
        for (const file of files) await service.recordWrite(hookInput.sessionID, file)
      }
    },
    async "permission.ask"(permission, output) {
      const found = service.memberForSession(permission.sessionID)
      if (!found) return
      if (permission.type === "task") {
        output.status = "deny"
        return
      }
      if (permission.type === "bash") {
        const command =
          patterns(permission.pattern).join(" ") ||
          (permission.metadata && typeof permission.metadata.command === "string"
            ? permission.metadata.command
            : "")
        const check = service.checkShell(permission.sessionID, command)
        if (check.effect === "deny") output.status = "deny"
        else if (check.effect === "ask") output.status = "ask"
      }
    },
    async dispose() {
      await service.dispose()
    },
  }
}

function patterns(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : []
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  return []
}
