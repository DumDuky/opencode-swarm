import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const SWARM_DIR = ".swarm"
const STATE_FILE = "state.json"
const AUDIT_FILE = "audit.jsonl"

async function ensureDir(directory: string): Promise<string> {
  const target = path.join(directory, SWARM_DIR)
  await mkdir(target, { recursive: true })
  try {
    await writeFile(
      path.join(target, ".gitignore"),
      "*\n!.gitignore\n",
      { encoding: "utf8", flag: "wx" },
    )
  } catch {
    // The file already exists.
  }
  return target
}

export async function readV1State(directory: string): Promise<unknown | undefined> {
  try {
    const content = await readFile(path.join(directory, SWARM_DIR, STATE_FILE), "utf8")
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

export async function writeV1State(directory: string, snapshot: unknown): Promise<void> {
  const targetDir = await ensureDir(directory)
  const target = path.join(targetDir, STATE_FILE)
  const temporary = `${target}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(temporary, JSON.stringify(snapshot, null, 2), "utf8")
  await rm(target, { force: true })
  await rename(temporary, target)
}

export async function appendV1Audit(directory: string, message: string): Promise<void> {
  try {
    const targetDir = await ensureDir(directory)
    await appendFile(
      path.join(targetDir, AUDIT_FILE),
      `${JSON.stringify({ time: new Date().toISOString(), message })}\n`,
      "utf8",
    )
  } catch {
    // Audit logging is best-effort.
  }
}
