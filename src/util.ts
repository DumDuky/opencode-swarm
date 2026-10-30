import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const now = () => Date.now()

export function randomID(prefix: string): string {
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${time}${random}`
}

export function createIDGenerator(prefix: string) {
  let counter = 0
  return () => `${prefix}_${(++counter).toString(36)}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

export function normalizePath(input: string): string {
  let value = input.trim().replace(/\\/g, "/")
  while (value.startsWith("./")) value = value.slice(2)
  if (value.length > 1) value = value.replace(/\/+$/, "")
  return value
}

export interface PathSpec {
  path: string
  directory: boolean
}

export function parsePathSpec(input: string): PathSpec {
  let value = normalizePath(input)
  let directory = false
  if (value.endsWith("/**")) {
    value = value.slice(0, -3)
    directory = true
  } else if (value.endsWith("/*")) {
    value = value.slice(0, -2)
    directory = true
  } else if (input.trim().endsWith("/")) {
    directory = true
  }
  return { path: value, directory }
}

export function isPathUnder(parent: string, child: string): boolean {
  const p = normalizePath(parent)
  const c = normalizePath(child)
  return c === p || c.startsWith(`${p}/`)
}

export function pathsOverlap(a: PathSpec, b: PathSpec): boolean {
  if (a.path === b.path) return true
  if (a.directory && isPathUnder(a.path, b.path)) return true
  if (b.directory && isPathUnder(b.path, a.path)) return true
  return false
}

export function resolveWorkspacePath(root: string, input: string): string {
  const cleaned = input.trim().replace(/^file:\/\//, "")
  if (path.isAbsolute(cleaned)) return path.resolve(cleaned)
  return path.resolve(root, cleaned)
}

export function relativeToWorkspace(root: string, absolute: string): string | undefined {
  const rel = path.relative(path.resolve(root), path.resolve(absolute))
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined
  return normalizePath(rel)
}

export async function fileHash(absolutePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(absolutePath)
    return createHash("sha256").update(content).digest("hex")
  } catch {
    return undefined
  }
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12)
}

export function safeString(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  }
  if (typeof value === "string" && value.trim()) return [value]
  return []
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export function formatMoney(value: number): string {
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function parseModelRef(value: string): { providerID: string; id: string; variant?: string } | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed === "inherit") return undefined
  const hash = trimmed.indexOf("#")
  const withoutVariant = hash >= 0 ? trimmed.slice(0, hash) : trimmed
  const variant = hash >= 0 ? trimmed.slice(hash + 1) : undefined
  const slash = withoutVariant.indexOf("/")
  if (slash <= 0 || slash === withoutVariant.length - 1) return undefined
  const providerID = withoutVariant.slice(0, slash)
  const id = withoutVariant.slice(slash + 1)
  return { providerID, id, ...(variant ? { variant } : {}) }
}

export function formatModelRef(model?: { providerID: string; id: string; variant?: string }): string {
  if (!model) return "inherit"
  return `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`
}

export function statusIcon(status: string): string {
  switch (status) {
    case "working":
      return "▶"
    case "idle":
      return "·"
    case "blocked":
      return "!"
    case "waiting_approval":
      return "?"
    case "done":
      return "✓"
    case "failed":
      return "✗"
    case "lost":
      return "✗"
    case "paused":
      return "‖"
    default:
      return "·"
  }
}
