import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContraClient, refreshAccessToken } from '../scripts/contra-client.mjs';
import { readToken, writeToken } from '../scripts/token-store.mjs';
import { readRpcResponse, fetchJson } from '../scripts/http.mjs';

const json = (value, options = {}) => new Response(JSON.stringify(value), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
const rpc = (id, result, options) => json({ jsonrpc: '2.0', id, result }, options);
const initialized = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
function fixture(t, fetchImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contra-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tokenPath = path.join(dir, 'token.json');
  writeToken(tokenPath, { access_token: 'test-old', refresh_token: 'test-refresh', client_id: 'test-client' });
  return { tokenPath, client: new ContraClient({ tokenPath, fetchImpl, timeoutMs: 500 }) };
}
function server(handler) {
  return async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'initialize') return rpc(body.id, initialized);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return handler(body, options, url);
  };
}

test('initializes once, propagates session/version, paginates catalog, unwraps tool output', async (t) => {
  const calls = [];
  const { client } = fixture(t, async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body.method);
    assert.equal(options.redirect, 'error');
    if (body.method === 'initialize') {
      assert.equal(body.params.protocolVersion, '2025-03-26');
      return rpc(body.id, initialized, { headers: { 'Mcp-Session-Id': 'fixture-session' } });
    }
    assert.equal(options.headers['Mcp-Session-Id'], 'fixture-session');
    assert.equal(options.headers['MCP-Protocol-Version'], '2025-03-26');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return rpc(body.id, body.params.cursor ? { tools: [{ name: 'list_services' }] } : { tools: [{ name: 'whoami' }], nextCursor: 'second' });
    return rpc(body.id, { content: [{ type: 'text', text: '{"ok":true}' }] });
  });
  assert.equal((await client.listTools()).length, 2);
  assert.deepEqual(await client.callTool('whoami'), { ok: true });
  assert.equal(calls.filter((method) => method === 'initialize').length, 1);
});

test('SSE handles notifications, wrong IDs, multiline data, UTF-8/chunked CRLF and stays open', async () => {
  const source = ': ping\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n'
    + 'data: {"jsonrpc":"2.0","id":99,"result":{}}\r\n\r\n'
    + 'data: {"jsonrpc":"2.0",\r\ndata: "id":7,"result":{"text":"Привет"}}\r\n\r\n';
  const bytes = new TextEncoder().encode(source);
  let offset = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset)); },
    cancel() { cancelled = true; },
  });
  const response = new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
  assert.deepEqual((await readRpcResponse(response, 7)).result, { text: 'Привет' });
  assert.equal(cancelled, true);
});

test('JSON, SSE and tool errors fail without echoing response secrets', async (t) => {
  await assert.rejects(readRpcResponse(json({ jsonrpc: '2.0', id: 2, result: {} }), 1), /ID/);
  await assert.rejects(readRpcResponse(new Response('secret', { headers: { 'Content-Type': 'application/json' } }), 1), /Invalid JSON/);
  await assert.rejects(readRpcResponse(json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'secret' } }), 1), (e) => e.message.includes('-32602') && !e.message.includes('secret'));
  await assert.rejects(readRpcResponse(new Response('data: {}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), 1), /Invalid JSON-RPC/);
  const { client } = fixture(t, server((body) => rpc(body.id, { isError: true, content: [{ type: 'text', text: 'secret' }] })));
  await assert.rejects(client.callTool('whoami'), (e) => /failed/.test(e.message) && !e.message.includes('secret'));
});

test('401 refresh rotates and securely saves token, then retries the same request once', async (t) => {
  let refreshCount = 0;
  const ids = [];
  const { client, tokenPath } = fixture(t, async (url, options) => {
    if (url.endsWith('/oauth/token')) {
      refreshCount++;
      assert.equal(new URLSearchParams(options.body).get('refresh_token'), 'test-refresh');
      return json({ access_token: 'test-new', refresh_token: 'test-rotated', expires_in: 1200, token_type: 'Bearer' });
    }
    const body = JSON.parse(options.body);
    if (body.method === 'initialize') {
      ids.push(body.id);
      if (options.headers.Authorization === 'Bearer test-old') return new Response(null, { status: 401 });
      assert.equal(options.headers.Authorization, 'Bearer test-new');
      return rpc(body.id, initialized);
    }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return rpc(body.id, { structuredContent: { ok: true } });
  });
  assert.deepEqual(await client.callTool('whoami'), { ok: true });
  assert.equal(refreshCount, 1); assert.equal(ids[0], ids[1]);
  const token = readToken(tokenPath);
  assert.equal(token.access_token, 'test-new'); assert.equal(token.refresh_token, 'test-rotated');
  assert.ok(Date.parse(token.expires_at) > Date.now());
  if (process.platform !== 'win32') assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
});

test('concurrent refreshes for the same token file share one request', async (t) => {
  let count = 0;
  const { tokenPath } = fixture(t);
  const fetchImpl = async () => { count++; return json({ access_token: 'test-new' }); };
  assert.deepEqual(await Promise.all([refreshAccessToken({ tokenPath, fetchImpl }), refreshAccessToken({ tokenPath, fetchImpl })]), ['test-new', 'test-new']);
  assert.equal(count, 1);
  assert.equal(readToken(tokenPath).refresh_token, 'test-refresh');
});

test('failed refresh preserves the token and suppresses server body', async (t) => {
  const { tokenPath } = fixture(t);
  const before = fs.readFileSync(tokenPath, 'utf8');
  await assert.rejects(refreshAccessToken({ tokenPath, fetchImpl: async () => new Response('secret', { status: 400 }) }), (e) => e.message.includes('400') && !e.message.includes('secret'));
  assert.equal(fs.readFileSync(tokenPath, 'utf8'), before);
  await assert.rejects(refreshAccessToken({ tokenPath, fetchImpl: async () => json({}) }), /no access token/);
  assert.equal(fs.readFileSync(tokenPath, 'utf8'), before);
});

test('second 401 stops; HTTP failures and network failures are never replayed', async (t) => {
  let count = 0;
  const { client } = fixture(t, async (url) => {
    count++;
    return url.endsWith('/oauth/token') ? json({ access_token: 'test-new' }) : new Response(null, { status: 401 });
  });
  await assert.rejects(client.callTool('whoami'), /401/); assert.equal(count, 3);
  for (const status of [404, 429, 500]) {
    let calls = 0;
    const { client: failing } = fixture(t, server(() => { calls++; return new Response('secret', { status }); }));
    await assert.rejects(failing.callTool('whoami'), new RegExp(String(status))); assert.equal(calls, 1);
  }
});

test('default tool boundary rejects prepare, confirm and unknown tools before I/O', async (t) => {
  let calls = 0;
  const { client } = fixture(t, server((body) => { calls++; return rpc(body.id, { structuredContent: { draftId: 'fixture-only' } }); }));
  for (const name of ['update_profile_prepare', 'update_profile_confirm', 'unknown_tool']) {
    await assert.rejects(client.callTool(name), /read-only allowlist/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await client.callTool('update_profile_prepare', {}, { allowMutation: true }), { draftId: 'fixture-only' });
  assert.equal(calls, 1);
});

test('catalog rejects looping cursors and initialization rejects unknown versions', async (t) => {
  const { client } = fixture(t, server((body) => rpc(body.id, { tools: [], nextCursor: 'same' })));
  await assert.rejects(client.listTools(), /Repeated/);
  const { client: incompatible } = fixture(t, async (url, options) => rpc(JSON.parse(options.body).id, { ...initialized, protocolVersion: 'unknown' }));
  await assert.rejects(incompatible.listTools(), /Unsupported MCP protocol/);
});

test('timeouts cover response body reads; HTTP errors do not print their bodies', async () => {
  const hungBody = async (url, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }); } }), { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(fetchJson(hungBody, 'https://contra.com/test', {}, 20), /timed out/);
  await assert.rejects(fetchJson(async () => new Response('secret', { status: 503 }), 'https://contra.com/test', {}), (e) => /503/.test(e.message) && !e.message.includes('secret'));
});

test('token storage replaces overly broad permissions, rejects symlinks, leaves no temp files', (t) => {
  const { tokenPath } = fixture(t);
  fs.chmodSync(tokenPath, 0o644);
  writeToken(tokenPath, { access_token: 'test-replacement' });
  if (process.platform !== 'win32') assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
  const link = path.join(path.dirname(tokenPath), 'link.json');
  fs.symlinkSync(tokenPath, link);
  assert.throws(() => writeToken(link, { access_token: 'bad' }), /regular file/);
  assert.equal(readToken(tokenPath).access_token, 'test-replacement');
  assert.deepEqual(fs.readdirSync(path.dirname(tokenPath)).sort(), ['link.json', 'token.json']);
});

test('SSE accepts CR-only delimiters and returns a response parsed at EOF', async () => {
  for (const ending of ['\r\r', '\r\n\r\n', '\n\n']) {
    const response = new Response(`data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}${ending}`, { headers: { 'Content-Type': 'text/event-stream' } });
    assert.deepEqual((await readRpcResponse(response, 1)).result, { ok: true });
  }
});

test('retryOn401 false applies to initialization and notification without touching credentials', async (t) => {
  for (const deniedMethod of ['initialize', 'notifications/initialized', 'tools/call']) {
    let refreshCalls = 0;
    const { client, tokenPath } = fixture(t, async (url, options) => {
      if (url.endsWith('/oauth/token')) { refreshCalls++; return json({ access_token: 'unexpected' }); }
      const body = JSON.parse(options.body);
      if (body.method === deniedMethod) return new Response(null, { status: 401 });
      if (body.method === 'initialize') return rpc(body.id, initialized);
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return rpc(body.id, { structuredContent: {} });
    });
    const before = fs.readFileSync(tokenPath, 'utf8');
    await assert.rejects(client.callTool('whoami', {}, { retryOn401: false }), /401/);
    assert.equal(refreshCalls, 0);
    assert.equal(fs.readFileSync(tokenPath, 'utf8'), before);
  }
});

test('mutations require the boolean true, not a truthy string', async (t) => {
  const { client } = fixture(t, () => assert.fail('no network request expected'));
  await assert.rejects(client.callTool('update_profile_confirm', {}, { allowMutation: 'false' }), /read-only allowlist/);
});

test('network errors are not replayed', async (t) => {
  let calls = 0;
  const { client } = fixture(t, server(() => { calls++; throw new Error('fixture connection reset'); }));
  await assert.rejects(client.callTool('whoami'), /network request failed/);
  assert.equal(calls, 1);
});
