# Health endpoint example

A minimal HTTP server exposing a `/health` endpoint, built with the Node.js
standard library only. No dependencies, no build step.

## Run

```sh
node server.js
```

With no `PORT` set, the server binds an ephemeral port and prints the port it
actually got as a single line on stdout:

```console
$ node server.js
53142
```

Set `PORT` to pick the port yourself:

```sh
PORT=3000 node server.js
```

On Windows PowerShell:

```powershell
$env:PORT = 3000; node server.js
```

Stop it with `Ctrl+C`; the process exits on `SIGINT`/`SIGTERM`.

The examples below assume `PORT=3000`.

## Endpoint contract

### `GET /health`

Returns the service health snapshot.

- **Status:** `200 OK`
- **Content-Type:** `application/json`

```json
{
  "status": "ok",
  "service": "opencode-swarm",
  "uptime": 12.345
}
```

| Field     | Type     | Meaning                                      |
| --------- | -------- | -------------------------------------------- |
| `status`  | `string` | Always `"ok"` while the process is serving.  |
| `service` | `string` | Service identifier, always `"opencode-swarm"`. |
| `uptime`  | `number` | Seconds the process has been running.        |

Any other path returns `404 Not Found` with a JSON body. Non-`GET` requests to
`/health` are also answered with `404`, so `GET` is the only supported method.

```json
{ "error": "Not Found" }
```

## curl example

```sh
curl -i http://127.0.0.1:3000/health
```

Expected response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","service":"opencode-swarm","uptime":1.234}
```

Unknown paths:

```sh
curl -i http://127.0.0.1:3000/nope
# HTTP/1.1 404 Not Found
```

## Test

The tests use the built-in `node:test` runner and `node:assert`, so nothing needs
to be installed. From this directory:

```sh
node --test server.test.js
```

Or from the repository root, where the quoted glob keeps the shell from expanding it:

```sh
node --test "examples/health-endpoint/*.test.js"
```

The suite starts the server on an ephemeral port (`0`), so it never collides with
a server you already have running, and closes it when the run finishes.
