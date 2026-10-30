# Verification report

Commands were run from the workspace root.

## Results

`node examples/tiny-demo/test-hello.js`

```text
PASS: hello.js output matches
```

Exit code: `0`

`node examples/tiny-demo/hello.js`

```text
hello from swarm
```

Exit code: `0`

The output is exactly `hello from swarm`.

## Scope check

The workspace is not a Git repository, so `git status` could not be used to verify changes. The file listing showed the expected demo files in `examples/tiny-demo`; this verification added only this report there. No files outside `examples/tiny-demo` were modified by this task.
