import type { PluginInput } from "@opencode-ai/plugin"
import type { Session } from "@opencode-ai/sdk"
import type {
  CreateSessionInput,
  PromptOptions,
  SessionInfoLike,
  SwarmRuntime,
  UpdateSessionInput,
} from "../runtime.js"
import { fileHash, sleep } from "../util.js"

type V1Status = { type?: string } | string | undefined

async function call<T>(value: PromiseLike<unknown> | unknown): Promise<T> {
  const result = (await value) as {
    data?: T
    error?: unknown
    [key: string]: unknown
  }
  if (result && typeof result === "object" && "error" in result && result.error) {
    throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error))
  }
  if (result && typeof result === "object" && "data" in result && result.data !== undefined) {
    return result.data as T
  }
  return result as T
}

function mapSession(session: Session): SessionInfoLike {
  return {
    id: session.id,
    parentID: session.parentID,
    title: session.title,
    metadata: {},
    time: {
      created: session.time?.created,
      updated: session.time?.updated,
    },
    location: { directory: session.directory },
  }
}

export function createV1Runtime(input: PluginInput): SwarmRuntime {
  const client = input.client as unknown as {
    session: {
      create(options: unknown): PromiseLike<unknown>
      get(options: unknown): PromiseLike<unknown>
      list(options?: unknown): PromiseLike<unknown>
      promptAsync(options: unknown): PromiseLike<unknown>
      prompt(options: unknown): PromiseLike<unknown>
      abort(options: unknown): PromiseLike<unknown>
      update(options: unknown): PromiseLike<unknown>
      messages(options: unknown): PromiseLike<unknown>
      status(options?: unknown): PromiseLike<unknown>
    }
  }
  const workspaceRoot = input.directory
  const agentOverrides = new Map<string, string>()

  const send = async (sessionID: string, text: string, options?: PromptOptions): Promise<void> => {
    const agent = options?.agent ?? agentOverrides.get(sessionID)
    const model = options?.model
    const body: Record<string, unknown> = {
      parts: [{ type: "text", text }],
    }
    if (agent) body.agent = agent
    if (model) body.model = { providerID: model.providerID, modelID: model.id }
    const request = {
      path: { id: sessionID },
      query: { directory: workspaceRoot },
      body,
      throwOnError: true,
    }
    if (typeof client.session.promptAsync === "function") {
      await call(client.session.promptAsync(request))
      return
    }
    // Older V1 builds may not expose promptAsync. Start the prompt without waiting
    // for the full assistant response so the spawn tool still returns immediately.
    void Promise.resolve(client.session.prompt(request)).catch((error) => {
      console.error("[swarm] background prompt failed:", error)
    })
  }

  const runtime: SwarmRuntime = {
    workspaceRoot,
    usageSource: "messages",
    async createSession(input: CreateSessionInput) {
      const session = await call<Session>(
        client.session.create({
          body: { parentID: input.parentID, title: input.title },
          query: { directory: workspaceRoot },
          throwOnError: true,
        }),
      )
      return mapSession(session)
    },
    async getSession(sessionID) {
      try {
        const session = await call<Session>(
          client.session.get({
            path: { id: sessionID },
            query: { directory: workspaceRoot },
            throwOnError: true,
          }),
        )
        return mapSession(session)
      } catch {
        return undefined
      }
    },
    async listSessions() {
      try {
        const sessions = await call<Session[]>(
          client.session.list({ query: { directory: workspaceRoot }, throwOnError: true }),
        )
        return sessions.map(mapSession)
      } catch {
        return []
      }
    },
    async prompt(sessionID, text, _delivery, options) {
      await send(sessionID, text, options)
    },
    async synthetic(sessionID, text, _description, options) {
      await send(sessionID, text, options)
    },
    async switchModel(_sessionID, _model) {
      // V1 has no session-level model switch endpoint. The swarm agent's configured
      // model and the user's model selection control the orchestrator; workers are
      // pinned per prompt by the swarm service.
    },
    async switchAgent(sessionID, agent) {
      agentOverrides.set(sessionID, agent)
    },
    async wait(sessionID) {
      for (let attempt = 0; attempt < 1200; attempt++) {
        const statuses = await runtime.statuses?.().catch(() => undefined)
        if (!statuses || !statuses[sessionID] || statuses[sessionID] === "idle") return
        await sleep(500)
      }
    },
    async context(sessionID) {
      const messages = await call<unknown[]>(
        client.session.messages({
          path: { id: sessionID },
          query: { directory: workspaceRoot },
          throwOnError: true,
        }),
      )
      return messages
    },
    async interrupt(sessionID) {
      await call(
        client.session.abort({
          path: { id: sessionID },
          query: { directory: workspaceRoot },
          throwOnError: true,
        }),
      )
    },
    async updateSession(sessionID, sessionInput: UpdateSessionInput) {
      if (!sessionInput.title) return
      await call(
        client.session.update({
          path: { id: sessionID },
          query: { directory: workspaceRoot },
          body: { title: sessionInput.title },
          throwOnError: true,
        }),
      )
    },
    async lastAssistantText(sessionID) {
      try {
        const messages = await call<Array<{ info?: Record<string, unknown>; parts?: Array<Record<string, unknown>> }>>(
          client.session.messages({
            path: { id: sessionID },
            query: { directory: workspaceRoot },
            throwOnError: true,
          }),
        )
        for (let index = messages.length - 1; index >= 0; index--) {
          const entry = messages[index]
          if (entry.info?.role !== "assistant") continue
          const text = (entry.parts ?? [])
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => String(part.text).trim())
            .filter(Boolean)
            .join("\n")
          if (text) return text
        }
        return undefined
      } catch {
        return undefined
      }
    },
    hashFile: fileHash,
    async statuses() {
      try {
        const raw = await call<Record<string, V1Status>>(
          client.session.status({ query: { directory: workspaceRoot }, throwOnError: true }),
        )
        const result: Record<string, "idle" | "busy" | "retry"> = {}
        for (const [sessionID, status] of Object.entries(raw ?? {})) {
          const type = typeof status === "string" ? status : status?.type
          if (type === "idle" || type === "busy" || type === "retry") result[sessionID] = type
        }
        return result
      } catch {
        return {}
      }
    },
    now: () => Date.now(),
    log: (...args) => console.error("[swarm]", ...args),
  }
  return runtime
}
