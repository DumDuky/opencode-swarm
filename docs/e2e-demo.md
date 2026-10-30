# Validation

These are real runs, not mocks. The goal each time was deliberately small so the orchestration, file safety, and verification paths could be checked end to end.

---

## Run 1 — parallel build (V1, OpenCode 1.19.4)

**Goal:** create a tiny demo with two files and a dependency-gated tester.

- The orchestrator created three tasks: `hello.js`, `test-hello.js`, and a tester task depending on both.
- Two workers wrote the two files in parallel.
- The tester verified both commands and wrote a report.
- The orchestrator independently re-ran the commands before closing.

```text
node examples/tiny-demo/hello.js
hello from swarm
exit 0

node examples/tiny-demo/test-hello.js
PASS: hello.js output matches
exit 0
```

- Result: **3/3 tasks done**
- Cost: about **$0.005** · ~96k tokens
- Model: `opencode-go/deepseek-v4.1-flash`
- Artifacts: [`examples/tiny-demo`](../examples/tiny-demo)

---

## Run 2 — dynamic write-set expansion

**Goal:** create `out.txt` and a `check.js` validator with one worker and one tester.

The tester discovered it needed one file outside its original write-set. It did **not** write it. It asked the orchestrator, the orchestrator expanded the task, reset it to `todo`, and the board re-validated the new write-set against every other open task. The tester reclaimed the task and finished.

```text
node examples/dynamic-write-set/check.js
OK: out.txt matches
exit 0
```

- Result: **2/2 tasks done**
- Cost: about **$0.044**
- Artifacts: [`examples/dynamic-write-set`](../examples/dynamic-write-set)

This is the intended safety path: agents adapt, but the orchestrator owns write-set changes and the board re-checks them.

---

## Run 3 — role agents verified

A third run created a cwd-independent check with one worker and one tester. Exporting the worker session showed `"mode": "swarm-worker"` on its assistant messages, confirming the child actually ran under the role agent rather than the parent agent.

- Result: **2/2 tasks done**
- Artifacts: [`examples/cwd-independent-check`](../examples/cwd-independent-check)

---

## Run 4 — V2 (OpenCode 2.2.0)

The plugin was loaded from the global V2 `plugins` config and the `swarm_start` tool was called from an ordinary chat.

- Orchestrator: `build`
- Worker and tester: built-in `general` agents with role instructions
- Dependency gate: the tester spawned only after the worker finished
- Result: **2/2 tasks done**
- The orchestrator independently ran the positive case and the negative case:

```text
node check.js
exit 0

# copied to a temp directory with wrong content
node check.js
exit 1
```

---

## What the runs demonstrate

- Parallel child sessions actually run.
- Dependency-gated tasks are not spawned early.
- File write-sets are enforced, including a deliberate expansion.
- Workers and testers complete and report.
- The orchestrator can wake, verify, and close the swarm.
- The same core works through both the V1 and V2 host adapters.

---

## Reproduce it

The example directories are self-contained. To run the plugin locally:

```bash
bun install
bun run check
```

Then follow the install instructions in the [README](../README.md) and start a small goal with `/swarm`.
