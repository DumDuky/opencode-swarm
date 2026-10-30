# Swarm

A parallel agent swarm is available in every chat and every project.

- Start with `/swarm <goal>` or call the `swarm_start` tool with the goal.
- `/swarm` starts in the current chat and may switch to the configured orchestrator agent (`build` by default). Calling `swarm_start` directly keeps the current agent and adds the orchestrator role instructions.
- The orchestrator plans with `swarm_task`, spawns workers with `swarm_spawn`, waits with `swarm_wait`, and closes with `swarm_finish`.
- Do not use the built-in task/subagent tool in a swarm session. Use `swarm_spawn`.
- Routine spawns and file claims are automatic. The orchestrator reviews only escalations such as sub-subagents, directory leases, member/concurrency thresholds, and budget warnings.
- `/swarm-status` shows the swarm. `/swarm-stop` stops it.
- Use `opencode-go/deepseek-v4.1-flash` by default. Change role models with the plugin options in `opencode.json` (V2) or `swarm.config.json` (V1).
