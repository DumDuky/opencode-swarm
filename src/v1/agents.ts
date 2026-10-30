import type { AgentConfig, Config } from "@opencode-ai/sdk"
import type { SwarmConfig } from "../types.js"
import {
  INTEGRATOR_SYSTEM,
  ORCHESTRATOR_SYSTEM,
  PLANNER_SYSTEM,
  REVIEWER_SYSTEM,
  SCOUT_SYSTEM,
  TESTER_SYSTEM,
  V1_APPROVE_COMMAND_TEMPLATE,
  V1_DENY_COMMAND_TEMPLATE,
  V1_STATUS_COMMAND_TEMPLATE,
  V1_STOP_COMMAND_TEMPLATE,
  V1_SWARM_COMMAND_TEMPLATE,
  WORKER_SYSTEM,
} from "../prompts.js"

function stripVariant(model: string): string | undefined {
  const value = model.trim()
  if (!value || value === "inherit") return undefined
  return value.split("#")[0]
}

export function v1Agents(config: SwarmConfig): Record<string, AgentConfig> {
  return {
    swarm: {
      description: "Orchestrates a parallel agent swarm with a shared task board, peer messaging, and file leases.",
      mode: "primary",
      prompt: ORCHESTRATOR_SYSTEM,
      model: stripVariant(config.models.orchestrator),
      maxSteps: 80,
      tools: { task: false },
      permission: {
        edit: "allow",
        bash: "allow",
        webfetch: "allow",
        external_directory: "ask",
      },
    },
    "swarm-worker": {
      description: "Implements one swarm task inside an explicit file write-set.",
      mode: "subagent",
      prompt: WORKER_SYSTEM,
      model: stripVariant(config.models.worker),
      maxSteps: 50,
      tools: { task: false, swarm_review: false, swarm_stop: false },
      permission: { edit: "allow", bash: "allow", webfetch: "allow", external_directory: "ask" },
    },
    "swarm-tester": {
      description: "Writes and runs tests for a swarm task.",
      mode: "subagent",
      prompt: TESTER_SYSTEM,
      model: stripVariant(config.models.tester),
      maxSteps: 50,
      tools: { task: false, swarm_review: false, swarm_stop: false },
      permission: { edit: "allow", bash: "allow", webfetch: "allow", external_directory: "ask" },
    },
    "swarm-integrator": {
      description: "Integrates completed swarm work and runs the verification suite.",
      mode: "subagent",
      prompt: INTEGRATOR_SYSTEM,
      model: stripVariant(config.models.integrator),
      maxSteps: 60,
      tools: { task: false, swarm_review: false, swarm_stop: false },
      permission: { edit: "allow", bash: "allow", webfetch: "allow", external_directory: "ask" },
    },
    "swarm-scout": {
      description: "Read-only researcher for a swarm.",
      mode: "subagent",
      prompt: SCOUT_SYSTEM,
      model: stripVariant(config.models.scout),
      maxSteps: 30,
      tools: { task: false, swarm_review: false, swarm_stop: false, swarm_spawn: false },
      permission: { edit: "deny", bash: "allow", webfetch: "allow", external_directory: "ask" },
    },
    "swarm-planner": {
      description: "Read-only planner that decomposes work into file-disjoint swarm tasks.",
      mode: "subagent",
      prompt: PLANNER_SYSTEM,
      model: stripVariant(config.models.planner),
      maxSteps: 40,
      tools: { task: false, swarm_review: false, swarm_stop: false, swarm_spawn: false },
      permission: { edit: "deny", bash: "allow", webfetch: "allow", external_directory: "ask" },
    },
    "swarm-reviewer": {
      description: "Read-only reviewer for swarm changes.",
      mode: "subagent",
      prompt: REVIEWER_SYSTEM,
      model: stripVariant(config.models.reviewer),
      maxSteps: 30,
      tools: { task: false, swarm_review: false, swarm_stop: false, swarm_spawn: false },
      permission: { edit: "deny", bash: "allow", webfetch: "allow", external_directory: "ask" },
    },
  }
}

export function v1Commands(): NonNullable<Config["command"]> {
  return {
    swarm: {
      description: "Start a parallel agent swarm. Usage: /swarm <goal>",
      agent: "swarm",
      template: V1_SWARM_COMMAND_TEMPLATE,
    },
    "swarm-status": {
      description: "Show the current swarm status.",
      template: V1_STATUS_COMMAND_TEMPLATE,
    },
    "swarm-stop": {
      description: "Stop the swarm in the current session.",
      agent: "swarm",
      template: V1_STOP_COMMAND_TEMPLATE,
    },
    "swarm-approve": {
      description: "Approve a pending swarm request. Usage: /swarm-approve <requestID> [reason]",
      agent: "swarm",
      template: V1_APPROVE_COMMAND_TEMPLATE,
    },
    "swarm-deny": {
      description: "Deny a pending swarm request. Usage: /swarm-deny <requestID> [reason]",
      agent: "swarm",
      template: V1_DENY_COMMAND_TEMPLATE,
    },
  }
}
