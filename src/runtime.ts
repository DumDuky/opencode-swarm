import { fileHash } from "./util.js"
import type { ModelRef } from "./types.js"

export interface PermissionRule {
  action: string
  resource: string
  effect: "allow" | "deny" | "ask"
}

export interface SessionInfoLike {
  id: string
  parentID?: string
  title?: string
  metadata?: Record<string, unknown>
  agent?: string
  model?: ModelRef
  cost?: number
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
  }
  outcome?: "succeeded" | "failed" | "interrupted"
  time?: {
    created?: number
    updated?: number
    idle?: number
  }
  location?: { directory?: string }
}

export interface CreateSessionInput {
  parentID?: string
  title: string
  agent?: string
  model?: ModelRef
  metadata?: Record<string, unknown>
  permissions?: PermissionRule[]
}

export interface UpdateSessionInput {
  title?: string
  metadata?: Record<string, unknown>
  permissions?: PermissionRule[]
}

export interface PromptOptions {
  agent?: string
  model?: ModelRef
}

export interface SwarmRuntime {
  readonly workspaceRoot: string
  readonly usageSource?: "session" | "messages"
  createSession(input: CreateSessionInput): Promise<SessionInfoLike>
  getSession(sessionID: string): Promise<SessionInfoLike | undefined>
  listSessions(input?: { directory?: string; limit?: number }): Promise<SessionInfoLike[]>
  prompt(sessionID: string, text: string, delivery?: "steer" | "queue", options?: PromptOptions): Promise<void>
  synthetic(
    sessionID: string,
    text: string,
    description?: string,
    options?: PromptOptions,
  ): Promise<void>
  switchModel(sessionID: string, model: ModelRef): Promise<void>
  switchAgent(sessionID: string, agent: string): Promise<void>
  wait(sessionID: string): Promise<void>
  context(sessionID: string): Promise<unknown[]>
  interrupt(sessionID: string): Promise<void>
  updateSession(sessionID: string, input: UpdateSessionInput): Promise<void>
  lastAssistantText(sessionID: string): Promise<string | undefined>
  hashFile(absolutePath: string): Promise<string | undefined>
  statuses?(): Promise<Record<string, "idle" | "busy" | "retry">>
  now(): number
  log(...args: unknown[]): void
}

export type OpenCodePluginContext = {
  app?: { version?: string }
  location: { directory: string; project?: { id?: string } }
  session: {
    create(input: unknown): Promise<unknown>
    get(input: unknown): Promise<unknown>
    list(input?: unknown): Promise<unknown>
    prompt(input: unknown): Promise<unknown>
    synthetic(input: unknown): Promise<unknown>
    wait(input: unknown): Promise<unknown>
    context(input: unknown): Promise<unknown>
    interrupt(input: unknown): Promise<unknown>
    update(input: unknown): Promise<unknown>
  }
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: T }).data
  }
  return value as T
}

export function createOpenCodeRuntime(ctx: OpenCodePluginContext): SwarmRuntime {
  const workspaceRoot = ctx.location.directory
  return {
    workspaceRoot,
    async createSession(input) {
      const body = {
        parentID: input.parentID,
        title: input.title,
        agent: input.agent,
        model: input.model,
        metadata: input.metadata,
        permissions: input.permissions,
      }
      const result = await ctx.session.create(body)
      return unwrap<SessionInfoLike>(result)
    },
    async getSession(sessionID) {
      try {
        const result = await ctx.session.get({ sessionID })
        return unwrap<SessionInfoLike>(result)
      } catch {
        return undefined
      }
    },
    async listSessions(input) {
      try {
        const result = await ctx.session.list({
          directory: input?.directory ?? workspaceRoot,
          limit: input?.limit ?? 100,
        })
        const page = result as { data?: SessionInfoLike[] }
        return Array.isArray(page.data) ? page.data : unwrap<SessionInfoLike[]>(result)
      } catch {
        return []
      }
    },
    async prompt(sessionID, text, delivery = "queue", _options) {
      await ctx.session.prompt({ sessionID, text, delivery })
    },
    async synthetic(sessionID, text, description, _options) {
      await ctx.session.synthetic({ sessionID, text, description })
    },
    async switchModel(sessionID, model) {
      await (ctx.session as unknown as {
        switchModel(input: { sessionID: string; model: ModelRef }): Promise<unknown>
      }).switchModel({ sessionID, model })
    },
    async switchAgent(sessionID, agent) {
      await (ctx.session as unknown as {
        switchAgent(input: { sessionID: string; agent: string }): Promise<unknown>
      }).switchAgent({ sessionID, agent })
    },
    async wait(sessionID) {
      await ctx.session.wait({ sessionID })
    },
    async context(sessionID) {
      const result = await ctx.session.context({ sessionID })
      return Array.isArray(result) ? result : unwrap<unknown[]>(result)
    },
    async interrupt(sessionID) {
      await ctx.session.interrupt({ sessionID, resume: false })
    },
    async updateSession(sessionID, input) {
      await ctx.session.update({ sessionID, ...input })
    },
    async lastAssistantText(sessionID) {
      const messages = await this.context(sessionID)
      return extractLastAssistantText(messages)
    },
    hashFile: fileHash,
    now: () => Date.now(),
    log: (...args) => console.error("[swarm]", ...args),
  }
}

export function extractLastAssistantText(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as Record<string, unknown> | undefined
    if (!message || message.type !== "assistant") continue
    const content = message.content
    if (typeof content === "string" && content.trim()) return content.trim()
    if (!Array.isArray(content)) continue
    const texts = content
      .filter(
        (part): part is { type: "text"; text: string } =>
          Boolean(part) &&
          typeof part === "object" &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
    if (texts.length > 0) return texts.join("\n")
  }
  return undefined
}

export function sessionTokens(session: SessionInfoLike | undefined): number {
  const tokens = session?.tokens
  if (!tokens) return 0
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  )
}
