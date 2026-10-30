import type { Member, Risk, Role, SwarmConfig } from "./types.js"

export type Decision = "allow" | "review" | "deny"

export interface PolicyDecision {
  decision: Decision
  risk: Risk
  reason: string
}

export interface SpawnPolicyInput {
  requester: Member
  targetRole: Role
  targetDepth: number
  memberCount: number
  activeCount: number
  recentSpawns: number
  budgetRatio: number
  taskSize?: "small" | "medium" | "large"
}

export interface FilePolicyInput {
  requester: Member
  paths: string[]
  directory: boolean
  outsideWorkspace: boolean
}

export interface ShellPolicyResult {
  risk: Risk
  decision: "allow" | "ask" | "deny"
  reason: string
}

export class PolicyEngine {
  readonly config: SwarmConfig

  constructor(config: SwarmConfig) {
    this.config = config
  }

  spawn(input: SpawnPolicyInput): PolicyDecision {
    if (input.taskSize === "large") {
      return {
        decision: "deny",
        risk: "medium",
        reason: "Large tasks must be split into smaller tasks before spawning.",
      }
    }
    if (input.targetDepth > this.config.limits.maxDepth) {
      return {
        decision: "deny",
        risk: "high",
        reason: `Maximum swarm depth is ${this.config.limits.maxDepth}.`,
      }
    }
    if (input.memberCount >= this.config.limits.maxMembers) {
      return {
        decision: "deny",
        risk: "high",
        reason: `Maximum member count is ${this.config.limits.maxMembers}. Finish or stop a member first.`,
      }
    }
    if (input.activeCount >= this.config.limits.maxConcurrent) {
      return {
        decision: "deny",
        risk: "medium",
        reason: `Concurrency limit is ${this.config.limits.maxConcurrent}. Wait for a member to finish before spawning another.`,
      }
    }
    if (input.budgetRatio >= this.config.budget.pauseAt) {
      return {
        decision: "deny",
        risk: "high",
        reason: `Budget is at ${Math.round(input.budgetRatio * 100)}%; spawning is paused.`,
      }
    }
    if (input.targetDepth >= 2) {
      return {
        decision: "review",
        risk: "medium",
        reason: `Spawning a sub-subagent at depth ${input.targetDepth} requires orchestrator review.`,
      }
    }
    if (input.recentSpawns >= 4) {
      return {
        decision: "review",
        risk: "medium",
        reason: "More than four spawns in the last ten seconds; review the burst.",
      }
    }
    if (input.memberCount >= this.config.limits.reviewAtMembers) {
      return {
        decision: "review",
        risk: "medium",
        reason: `The swarm has ${input.memberCount} members; review the next spawn.`,
      }
    }
    if (input.budgetRatio >= this.config.budget.warnAt) {
      return {
        decision: "review",
        risk: "medium",
        reason: `Budget is at ${Math.round(input.budgetRatio * 100)}%; review the next spawn.`,
      }
    }
    if (this.config.approval.mode === "strict" && input.requester.role !== "orchestrator") {
      return {
        decision: "review",
        risk: "medium",
        reason: "Strict mode: worker spawns require orchestrator review.",
      }
    }
    return {
      decision: "allow",
      risk: input.targetDepth >= 1 ? "low" : "low",
      reason: "Within swarm limits.",
    }
  }

  file(input: FilePolicyInput): PolicyDecision {
    if (input.outsideWorkspace) {
      return {
        decision: "review",
        risk: "high",
        reason: "The claim is outside the workspace.",
      }
    }
    if (input.directory && input.requester.role !== "orchestrator") {
      return {
        decision: "review",
        risk: "medium",
        reason: "Directory-wide leases require orchestrator review.",
      }
    }
    return { decision: "allow", risk: "low", reason: "File claim within the workspace." }
  }

  shell(command: string): ShellPolicyResult {
    const text = command.toLowerCase()
    if (
      /rm\s+-rf\s+(\/|~|c:\\|\\\\)/.test(text) ||
      /\bmkfs\b|\bdd\s+if=|\bdiskpart\b|\bbcdedit\b|\bshutdown\b|\breboot\b/.test(text) ||
      /:\(\)\s*\{/.test(text)
    ) {
      return { risk: "critical", decision: "deny", reason: "Destructive system command blocked." }
    }
    if (
      /\bgit\s+push\s+(-f|--force)\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-z]*f/.test(text) ||
      /\bsudo\b|\brunas\b|\bchmod\s+777\b|\bchown\b/.test(text) ||
      /\b(curl|wget)\b.*\|\s*(sh|bash|zsh|powershell)\b/.test(text) ||
      /\b(npm|pnpm|yarn)\s+publish\b|\bpip\s+install\b|\b(npm|pnpm|yarn)\s+(install|add)\b/.test(text) ||
      /\b(apt|apt-get|brew|docker|kubectl|terraform|aws|gcloud|az)\b/.test(text)
    ) {
      return {
        risk: "high",
        decision: "ask",
        reason: "High-impact shell command requires approval.",
      }
    }
    if (
      /(^|\s)(>|>>)\s*\S/.test(text) ||
      /\bsed\s+-i\b|\bperl\s+-pi\b|\btee\b|\btruncate\b|\btouch\b/.test(text) ||
      /\b(mv|cp|rm)\s+/.test(text) ||
      /\bgit\s+(checkout\s+--|restore|apply)\b|\bpatch\s+/.test(text)
    ) {
      return {
        risk: "medium",
        decision: "allow",
        reason: "Shell command may write files; prefer edit tools so leases and hashes apply.",
      }
    }
    return { risk: "low", decision: "allow", reason: "Routine shell command." }
  }

  timeoutDecision(risk: Risk): "allow" | "deny" {
    if (risk === "low") return "allow"
    if (risk === "medium") return this.config.approval.onTimeoutMedium
    return this.config.approval.onTimeoutHigh
  }
}
