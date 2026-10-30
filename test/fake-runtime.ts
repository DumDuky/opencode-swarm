import os from "node:os"
import path from "node:path"
import type {
  CreateSessionInput,
  SessionInfoLike,
  SwarmRuntime,
  UpdateSessionInput,
} from "../src/runtime.js"

export class FakeRuntime implements SwarmRuntime {
  readonly workspaceRoot = path.join(os.tmpdir(), "opencode-swarm-test")
  readonly sessions = new Map<string, SessionInfoLike>()
  readonly prompts = new Map<string, string[]>()
  readonly synthetics = new Map<string, string[]>()
  readonly messages = new Map<string, unknown[]>()
  readonly lastText = new Map<string, string>()
  readonly hashes = new Map<string, string>()
  readonly interrupted = new Set<string>()
  private counter = 0

  addSession(input: {
    id: string
    title?: string
    agent?: string
    model?: { providerID: string; id: string; variant?: string }
    parentID?: string
    metadata?: Record<string, unknown>
    cost?: number
    tokens?: SessionInfoLike["tokens"]
  }): SessionInfoLike {
    const session: SessionInfoLike = {
      id: input.id,
      parentID: input.parentID,
      title: input.title ?? input.id,
      agent: input.agent ?? "build",
      model: input.model ?? { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
      metadata: input.metadata ?? {},
      cost: input.cost ?? 0,
      tokens: input.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.now(), updated: Date.now() },
      location: { directory: this.workspaceRoot },
    }
    this.sessions.set(session.id, session)
    return session
  }

  async createSession(input: CreateSessionInput): Promise<SessionInfoLike> {
    const id = `ses_${++this.counter}`
    return this.addSession({
      id,
      title: input.title,
      agent: input.agent,
      model: input.model,
      parentID: input.parentID,
      metadata: input.metadata,
    })
  }

  async getSession(sessionID: string): Promise<SessionInfoLike | undefined> {
    return this.sessions.get(sessionID)
  }

  async listSessions(): Promise<SessionInfoLike[]> {
    return [...this.sessions.values()]
  }

  async prompt(sessionID: string, text: string): Promise<void> {
    const list = this.prompts.get(sessionID) ?? []
    list.push(text)
    this.prompts.set(sessionID, list)
    const session = this.sessions.get(sessionID)
    if (session) session.time = { ...session.time, updated: Date.now() }
  }

  async synthetic(sessionID: string, text: string): Promise<void> {
    const list = this.synthetics.get(sessionID) ?? []
    list.push(text)
    this.synthetics.set(sessionID, list)
  }
  async switchModel(sessionID: string, model: { providerID: string; id: string; variant?: string }): Promise<void> {
    const session = this.sessions.get(sessionID)
    if (session) session.model = model
  }

  async switchAgent(sessionID: string, agent: string): Promise<void> {
    const session = this.sessions.get(sessionID)
    if (session) session.agent = agent
  }

  async wait(): Promise<void> {
    return
  }

  async context(sessionID: string): Promise<unknown[]> {
    return this.messages.get(sessionID) ?? []
  }

  async interrupt(sessionID: string): Promise<void> {
    this.interrupted.add(sessionID)
    const session = this.sessions.get(sessionID)
    if (session) session.outcome = "interrupted"
  }

  async updateSession(sessionID: string, input: UpdateSessionInput): Promise<void> {
    const session = this.sessions.get(sessionID)
    if (!session) return
    if (input.title) session.title = input.title
    if (input.metadata) session.metadata = { ...(session.metadata ?? {}), ...input.metadata }
  }

  async lastAssistantText(sessionID: string): Promise<string | undefined> {
    return this.lastText.get(sessionID)
  }

  async hashFile(absolutePath: string): Promise<string | undefined> {
    return this.hashes.get(path.resolve(absolutePath))
  }

  now(): number {
    return Date.now()
  }

  log(): void {
    // Tests stay quiet unless they opt in.
  }
}
