# Verification: health endpoint

Independent verification of `server.js` against the acceptance criteria:

1. the automated test suite passes,
2. a live `GET /health` returns `200` with the expected JSON,
3. an unknown path returns `404`.

This file was the only artifact written by the verification task. `server.js`,
`server.test.js`, and `README.md` were not modified.

## Environment

| Item | Value |
| --- | --- |
| Node.js | v24.18.0 |
| OS | Windows 10.0.26200 |
| Shell | Windows PowerShell 5.1 |
| Working directory | repository root |

`server.js` uses only Node.js built-in modules (`node:http`, `node:url`), so no
install step is required.

## 1. Automated test suite

Command, from the repository root:

```text
node --test examples/health-endpoint/server.test.js
```

Observed result:

```text
tests 4
suites 2
pass 4
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 204.8458
```

**PASS** - 4 tests, 4 passing, 0 failing. Exit code `0`.

The suite covers:

- `GET /health` returns `200` with `Content-Type: application/json`.
- The body has `status: "ok"`, `service: "opencode-swarm"`, and a finite numeric
  `uptime >= 0`.
- An unknown path returns `404`.
- The server closes cleanly and stops listening after the check.

Node's test runner exits non-zero on any failure, so the exit code is a reliable
gate.

## 2. Live server: `GET /health` returns 200

The server was started on a fixed port for reproducibility.

```powershell
$env:PORT = '43117'
$p = Start-Process node -ArgumentList 'examples/health-endpoint/server.js' -PassThru
Start-Sleep -Seconds 2
curl.exe -s -i "http://127.0.0.1:43117/health"
```

Observed startup output:

```text
43117
```

Observed response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 61

{"status":"ok","service":"opencode-swarm","uptime":1.6160408}
```

**PASS** - status `200`, JSON content type, and all three expected fields with
the expected values. `uptime` is a number and varies per run by design.

## 3. Live server: unknown path returns 404

```powershell
curl.exe -s -i "http://127.0.0.1:43117/does-not-exist"
```

Observed response:

```http
HTTP/1.1 404 Not Found
Content-Type: application/json
Content-Length: 21

{"error":"Not Found"}
```

**PASS** - status `404` with a JSON error body, as specified.

The server process was stopped after the checks; its stderr was empty. No
crashes, warnings, or unhandled rejections occurred during startup or while
serving requests.

## Summary

| Check | Expected | Observed | Exit code | Status |
| --- | --- | --- | --- | --- |
| `node --test examples/health-endpoint/server.test.js` | 4 passing tests | 4 pass, 0 fail | `0` | PASS |
| `GET /health` on port 43117 | `200` + expected JSON | matches | `0` | PASS |
| `GET /does-not-exist` | `404` | `404` + JSON error | `0` | PASS |

All three acceptance criteria are met. No other files were changed by the
verification task.
