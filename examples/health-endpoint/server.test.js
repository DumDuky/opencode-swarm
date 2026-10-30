import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createHealthServer } from './server.js';

/**
 * Start the health server on an ephemeral port and resolve once it is listening.
 */
async function startServer() {
  const server = createHealthServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

/**
 * Close the server without hanging on keep-alive sockets.
 */
async function stopServer(server) {
  if (!server || !server.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('health endpoint', () => {
  let server;
  let baseUrl;

  before(async () => {
    ({ server, baseUrl } = await startServer());
  });

  after(async () => {
    await stopServer(server);
  });

  it('responds 200 with JSON on GET /health', async () => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  });

  it('reports status, service and a numeric uptime', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'opencode-swarm');
    assert.equal(typeof body.uptime, 'number');
    assert.ok(Number.isFinite(body.uptime));
    assert.ok(body.uptime >= 0, `expected uptime >= 0, got ${body.uptime}`);
  });

  it('responds 404 for an unknown path', async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);

    assert.equal(response.status, 404);
  });
});

describe('server lifecycle', () => {
  it('closes cleanly after the health check', async () => {
    const { server: lifecycleServer, baseUrl: lifecycleBaseUrl } =
      await startServer();

    try {
      const response = await fetch(`${lifecycleBaseUrl}/health`);
      assert.equal(response.status, 200);
    } finally {
      await stopServer(lifecycleServer);
    }

    assert.equal(lifecycleServer.listening, false);
  });
});
