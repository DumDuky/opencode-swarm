import { SwarmError } from "./errors.js"
import type {
  MemberID,
  Message,
  MessageKind,
  MessagePriority,
  Swarm,
  SwarmID,
} from "./types.js"
import { now, shortHash, truncate } from "./util.js"

export interface SendInput {
  from: MemberID
  to: MemberID | "broadcast"
  kind?: MessageKind
  priority?: MessagePriority
  body: string
  replyTo?: string
}

export interface ReadOptions {
  unreadOnly?: boolean
  limit?: number
}

export class Bus {
  readonly swarm: Swarm
  private waiters = new Map<MemberID, (message: Message) => void>()
  private rate = new Map<MemberID, number[]>()
  private recentHashes = new Map<string, number[]>()

  constructor(swarm: Swarm) {
    this.swarm = swarm
  }

  send(input: SendInput, maxLength: number, maxPerMinute: number): Message {
    const from = this.swarm.members.get(input.from)
    if (!from) throw new SwarmError(`Member ${input.from} not found.`)
    const body = input.body?.trim()
    if (!body) throw new SwarmError("Message body is empty.")
    if (body.length > maxLength) {
      throw new SwarmError(`Message is too long (${body.length}/${maxLength} characters).`)
    }
    if (input.to !== "broadcast" && !this.swarm.members.has(input.to)) {
      throw new SwarmError(`Member ${input.to} not found.`)
    }
    if (input.to === input.from && input.kind !== "status") {
      throw new SwarmError("Do not send a message to yourself; use swarm_status instead.")
    }

    const timestamp = now()
    const times = (this.rate.get(input.from) ?? []).filter((time) => timestamp - time < 60_000)
    if (times.length >= maxPerMinute) {
      throw new SwarmError(
        `Rate limit: ${input.from} already sent ${times.length} messages in the last minute.`,
        "rate_limit",
      )
    }
    times.push(timestamp)
    this.rate.set(input.from, times)

    const loopKey = `${input.from}->${input.to}:${shortHash(body)}`
    const loopTimes = (this.recentHashes.get(loopKey) ?? []).filter((time) => timestamp - time < 10 * 60_000)
    if (loopTimes.length >= 3) {
      throw new SwarmError(
        "Repeated identical message detected and dropped. Summarize the state or change the message.",
        "loop_detected",
      )
    }
    loopTimes.push(timestamp)
    this.recentHashes.set(loopKey, loopTimes)

    const message: Message = {
      id: `m${++this.swarm.counters.message}`,
      swarmID: this.swarm.id,
      from: input.from,
      to: input.to,
      kind: input.kind ?? "note",
      priority: input.priority ?? "normal",
      body,
      replyTo: input.replyTo,
      createdAt: timestamp,
      readBy: [input.from],
    }
    this.swarm.messages.push(message)
    if (this.swarm.messages.length > 600) {
      this.swarm.messages.splice(0, this.swarm.messages.length - 600)
    }
    this.swarm.updatedAt = timestamp
    this.swarm.version++
    this.notify(message)
    return message
  }

  read(memberID: MemberID, options: ReadOptions = {}): Message[] {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
    const unreadOnly = options.unreadOnly !== false
    const messages = this.swarm.messages
      .filter((message) => message.to === memberID || message.to === "broadcast")
      .filter((message) => (unreadOnly ? !message.readBy.includes(memberID) : true))
      .slice(-limit)
      .reverse()
    for (const message of messages) {
      if (!message.readBy.includes(memberID)) message.readBy.push(memberID)
    }
    if (messages.length > 0) {
      this.swarm.updatedAt = now()
      this.swarm.version++
    }
    return messages
  }

  wait(memberID: MemberID, timeoutMs: number): Promise<Message | undefined> {
    const unread = this.read(memberID, { unreadOnly: true, limit: 1 })
    if (unread.length > 0) return Promise.resolve(unread[0])
    return new Promise((resolve) => {
      let settled = false
      const finish = (message?: Message) => {
        if (settled) return
        settled = true
        this.waiters.delete(memberID)
        clearTimeout(timer)
        resolve(message)
      }
      const timer = setTimeout(() => finish(undefined), Math.max(1_000, Math.min(timeoutMs, 120_000)))
      this.waiters.set(memberID, (message) => {
        if (!message.readBy.includes(memberID)) message.readBy.push(memberID)
        finish(message)
      })
    })
  }

  unreadCount(memberID: MemberID): number {
    return this.swarm.messages.filter(
      (message) => (message.to === memberID || message.to === "broadcast") && !message.readBy.includes(memberID),
    ).length
  }

  recent(limit = 5): Message[] {
    return this.swarm.messages.slice(-limit)
  }

  private notify(message: Message) {
    if (message.to === "broadcast") {
      for (const waiter of this.waiters.values()) waiter(message)
      return
    }
    const waiter = this.waiters.get(message.to)
    if (waiter) waiter(message)
  }
}

export function formatMessage(message: Message, maxBody = 1200): string {
  return [
    `[${message.id}] ${message.from} -> ${message.to} (${message.kind}, ${message.priority})`,
    truncate(message.body, maxBody),
  ].join("\n")
}
