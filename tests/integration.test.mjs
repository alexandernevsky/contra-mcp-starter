import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ContraClient } from '../scripts/contra-client.mjs';
import { writeToken } from '../scripts/token-store.mjs';

// All HTTP traffic in this file goes to this loopback fixture. No live credentials.
test('real HTTP roundtrip initializes, refreshes, reads catalog and account with mixed JSON/SSE', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contra-wire-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tokenPath = path.join(dir, 'token.json');
  writeToken(tokenPath, { access_token: 'expired-fixture', refresh_token: 'fixture-refresh', client_id: 'fixture-client' });
  const seen = [];
  let serverError;
  const server = http.createServer(async (req, res) => {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      if (req.url.endsWith('/token')) {
        seen.push('refresh');
        assert.equal(new URLSearchParams(raw).get('refresh_token'), 'fixture-refresh');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'active-fixture', refresh_token: 'rotated-fixture' })); return;
      }
      if (req.headers.authorization === 'Bearer expired-fixture') { res.writeHead(401); res.end(); return; }
      assert.equal(req.headers.authorization, 'Bearer active-fixture');
      const message = JSON.parse(raw); seen.push(message.method);
      if (message.method !== 'initialize') {
        assert.equal(req.headers['mcp-session-id'], 'fixture-session');
        assert.equal(req.headers['mcp-protocol-version'], '2025-03-26');
      }
      if (message.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
      let result;
      if (message.method === 'initialize') {
        res.setHeader('Mcp-Session-Id', 'fixture-session');
        result = { protocolVersion: '2025-03-26', capabilities: { tools: {} } };
      } else if (message.method === 'tools/list') result = { tools: [{ name: 'whoami', inputSchema: { type: 'object' } }] };
      else {
        assert.equal(message.method, 'tools/call'); assert.equal(message.params.name, 'whoami');
        result = { structuredContent: { visitor: { userAccount: { profile: { displayUsername: 'fixture-person' } } } } };
      }
      const body = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
      if (message.method === 'tools/call') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(': keepalive\n\n'); res.end(`data: ${body}\n\n`);
      } else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(body); }
    } catch (error) { serverError = error; res.writeHead(500); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new ContraClient({ tokenPath, fetchImpl: (url, options) => fetch(base + new URL(url).pathname, options) });
  assert.equal((await client.listTools())[0].name, 'whoami');
  assert.equal((await client.callTool('whoami')).visitor.userAccount.profile.displayUsername, 'fixture-person');
  assert.equal(serverError, undefined);
  assert.deepEqual(seen, ['refresh', 'initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
});

test('auth CLI discovery failure exits nonzero and does not create tokens or open a browser', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contra-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const authScript = new URL('../scripts/auth.mjs', import.meta.url);
  const preload = 'data:text/javascript,' + encodeURIComponent('globalThis.fetch = async () => { throw new Error("fixture-offline"); };');
  await assert.rejects(promisify(execFile)(process.execPath, ['--import', preload, authScript.pathname], {
    env: { ...process.env, PORT: '0', CONTRA_TOKEN_PATH: path.join(dir, 'token.json') }, timeout: 5000,
  }), (error) => error.code === 1 && /OAuth discovery network request failed/.test(error.stderr) && !/verified/i.test(error.stdout));
  assert.deepEqual(fs.readdirSync(dir), []);
});
