import http from 'node:http';
import { pathToFileURL } from 'node:url';

const SERVICE_NAME = 'opencode-swarm';

/**
 * Create an HTTP server exposing a health endpoint.
 *
 * GET /health -> 200 {"status":"ok","service":"opencode-swarm","uptime":<number>}
 * Anything else -> 404
 *
 * Uses only Node.js built-in modules.
 *
 * @returns {import('node:http').Server}
 */
export function createHealthServer() {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      pathname = req.url;
    }

    if (req.method === 'GET' && pathname === '/health') {
      const body = JSON.stringify({
        status: 'ok',
        service: SERVICE_NAME,
        uptime: process.uptime(),
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    const body = JSON.stringify({ error: 'Not Found' });
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const server = createHealthServer();
  const port = process.env.PORT || 0;
  server.listen(port, () => {
    const address = server.address();
    process.stdout.write(`${address.port}\n`);
  });
}
