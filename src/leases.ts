import path from "node:path"
import { SwarmError } from "./errors.js"
import type { Lease, LeaseID, MemberID, Swarm, TaskID } from "./types.js"
import { isPathUnder, normalizePath, now, parsePathSpec, pathsOverlap, relativeToWorkspace } from "./util.js"

export interface LeaseConflict {
  path: string
  existing: Lease
}

export interface ClaimResult {
  ok: boolean
  leases: Lease[]
  conflicts: LeaseConflict[]
}

export class LeaseManager {
  readonly swarm: Swarm
  readonly workspaceRoot: string
  private readHashes = new Map<MemberID, Map<string, string>>()

  constructor(swarm: Swarm, workspaceRoot: string) {
    this.swarm = swarm
    this.workspaceRoot = workspaceRoot
  }

  claim(owner: MemberID, inputs: string[], ttlMs: number, taskID?: TaskID): ClaimResult {
    if (!this.swarm.members.has(owner)) throw new SwarmError(`Member ${owner} not found.`)
    const specs = dedupeSpecs(inputs.map((input) => this.normalizeInput(input)))
    if (specs.length === 0) throw new SwarmError("At least one file path is required.")

    const conflicts: LeaseConflict[] = []
    for (const spec of specs) {
      for (const lease of this.swarm.leases.values()) {
        if (lease.owner === owner) continue
        if (!pathsOverlap({ path: lease.path, directory: lease.directory }, spec)) continue
        conflicts.push({ path: spec.path, existing: lease })
      }
    }
    if (conflicts.length > 0) {
      return { ok: false, leases: [], conflicts }
    }

    const timestamp = now()
    const leases: Lease[] = []
    for (const spec of specs) {
      let lease = [...this.swarm.leases.values()].find(
        (candidate) =>
          candidate.owner === owner && candidate.path === spec.path && candidate.directory === spec.directory,
      )
      if (!lease) {
        lease = {
          id: `l${++this.swarm.counters.lease}` as LeaseID,
          swarmID: this.swarm.id,
          path: spec.path,
          directory: spec.directory,
          owner,
          taskID,
          createdAt: timestamp,
          updatedAt: timestamp,
          expiresAt: timestamp + ttlMs,
        }
        this.swarm.leases.set(lease.id, lease)
      } else {
        lease.updatedAt = timestamp
        lease.expiresAt = timestamp + ttlMs
        if (taskID) lease.taskID = taskID
      }
      leases.push(lease)
    }
    this.touch()
    return { ok: true, leases, conflicts: [] }
  }

  autoClaim(owner: MemberID, input: string, ttlMs: number, taskID?: TaskID): ClaimResult {
    return this.claim(owner, [input], ttlMs, taskID)
  }

  release(owner: MemberID, inputs?: string[]): Lease[] {
    const specs = inputs?.map((input) => this.normalizeInput(input))
    const released: Lease[] = []
    for (const lease of [...this.swarm.leases.values()]) {
      if (lease.owner !== owner) continue
      if (specs && specs.length > 0) {
        const matches = specs.some((spec) =>
          pathsOverlap({ path: lease.path, directory: lease.directory }, spec),
        )
        if (!matches) continue
      }
      this.swarm.leases.delete(lease.id)
      released.push(lease)
    }
    if (released.length > 0) this.touch()
    return released
  }

  releaseAll(owner: MemberID): Lease[] {
    return this.release(owner)
  }

  check(owner: MemberID, input: string): LeaseConflict | undefined {
    const spec = this.normalizeInput(input)
    for (const lease of this.swarm.leases.values()) {
      if (lease.owner === owner) continue
      if (pathsOverlap({ path: lease.path, directory: lease.directory }, spec)) {
        return { path: spec.path, existing: lease }
      }
    }
    return undefined
  }

  expire(reference = now()): Lease[] {
    const expired: Lease[] = []
    for (const lease of [...this.swarm.leases.values()]) {
      if (lease.expiresAt > reference) continue
      this.swarm.leases.delete(lease.id)
      expired.push(lease)
    }
    if (expired.length > 0) this.touch()
    return expired
  }

  list(owner?: MemberID): Lease[] {
    return [...this.swarm.leases.values()]
      .filter((lease) => (owner ? lease.owner === owner : true))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  recordRead(owner: MemberID, input: string, hash: string): void {
    const key = this.normalizeInput(input).path
    const map = this.readHashes.get(owner) ?? new Map<string, string>()
    map.set(key, hash)
    this.readHashes.set(owner, map)
  }

  recordWrite(owner: MemberID, input: string, hash: string | undefined): void {
    const key = this.normalizeInput(input).path
    const map = this.readHashes.get(owner) ?? new Map<string, string>()
    if (hash) map.set(key, hash)
    else map.delete(key)
    this.readHashes.set(owner, map)
  }

  checkStale(owner: MemberID, input: string, currentHash: string | undefined): { stale: boolean; recorded?: string } {
    const key = this.normalizeInput(input).path
    const recorded = this.readHashes.get(owner)?.get(key)
    if (!recorded) return { stale: false }
    if (!currentHash) return { stale: true, recorded }
    return { stale: recorded !== currentHash, recorded }
  }

  absolute(logicalPath: string): string {
    return path.isAbsolute(logicalPath) ? path.resolve(logicalPath) : path.resolve(this.workspaceRoot, logicalPath)
  }

  private normalizeInput(input: string): { path: string; directory: boolean } {
    const spec = parsePathSpec(input)
    if (path.isAbsolute(spec.path)) {
      const relative = relativeToWorkspace(this.workspaceRoot, spec.path)
      if (relative) return { path: relative, directory: spec.directory }
      return { path: normalizePath(spec.path), directory: spec.directory }
    }
    return spec
  }

  private touch() {
    this.swarm.updatedAt = now()
    this.swarm.version++
  }
}

function dedupeSpecs(specs: Array<{ path: string; directory: boolean }>): Array<{ path: string; directory: boolean }> {
  const seen = new Set<string>()
  const result: Array<{ path: string; directory: boolean }> = []
  for (const spec of specs) {
    const key = `${spec.directory ? "d" : "f"}:${spec.path}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(spec)
  }
  return result
}

export function leaseSummary(lease: Lease): string {
  return `${lease.directory ? "dir " : "file"} ${lease.path} -> ${lease.owner}${lease.taskID ? ` (${lease.taskID})` : ""}`
}

export function pathInLease(lease: Lease, candidate: string): boolean {
  if (lease.directory) return isPathUnder(lease.path, candidate)
  return lease.path === candidate
}
