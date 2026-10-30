# Contributing

Thanks for helping improve `opencode-swarm`.

## Setup

```bash
git clone https://github.com/DumDuky/opencode-swarm.git
cd opencode-swarm
bun install
```

## Checks

Run the full gate before opening a PR:

```bash
bun run check
```

That runs TypeScript and the Bun test suite. If you change behavior, add or update a test in `test/`.

## What to work on

Good first issues are labeled `good first issue`. Larger changes should start with an issue so the design can be discussed before implementation.

The highest-value areas right now:

- worktree isolation and a merge queue
- TUI dashboard for live swarm state
- better plan validation and conflict detection
- recovery and budget edge cases
- documentation and examples

## Design principles

- **The core stays host-independent.** `src/service.ts` depends on the narrow `SwarmRuntime` interface. Keep new orchestration logic testable with `test/fake-runtime.ts`.
- **Safety is a feature.** Do not weaken file leases, content-hash checks, approval gates, or budget limits without a clear replacement.
- **Keep the orchestrator low-friction.** Routine work should not require human approval.
- **No silent overwrites.** If a change makes concurrent editing less safe, document it and add a test.
- **Small, focused PRs.** Separate refactors from behavior changes.

## Pull requests

1. Fork the repo and create a branch.
2. Make the change with tests.
3. Run `bun run check`.
4. Open a PR using the template.
5. Link the issue it resolves.

## Commit style

Use short, imperative commits, for example:

```text
feat: add worktree merge queue
fix: wake orchestrator for unowned ready tasks
docs: add V2 install example
```

## Security

Please do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the MIT license.
