# Changelog

## 0.1.0

Initial release.

### Added

- `/swarm <goal>` command and `swarm_start` tool.
- Task board with plan-time write-set validation, dependencies, and acceptance criteria.
- Parallel child sessions with per-role agents and models.
- File leases, TTLs, reentrant claims, directory/file conflicts, and content-hash stale-write checks.
- Peer message bus with direct messages, broadcast, blocking waits, rate limits, and loop detection.
- Policy engine for spawn, file, shell, and approval risk.
- Orchestrator-only review queue for sub-subagents, directory leases, thresholds, and budget warnings.
- Deterministic supervisor for stale locks, idle workers, failures, retries, reassignment, budgets, completion, and persistence.
- Wake-up path for ready and blocked tasks so the orchestrator does not stall between turns.
- OpenCode Go defaults with DeepSeek V4.1 Flash and per-role model overrides.
- V2 plugin entrypoint and V1 fallback loader.
- 52 tests covering the core and the health endpoint example.
- Four example projects and real validation runs.
- A self-contained health endpoint example with Node.js tests and a live verification report.
