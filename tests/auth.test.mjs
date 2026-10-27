import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPkce, discoverOAuth, listenForCallback, runAuth } from '../scripts/auth.mjs';

const metadata = {
  authorization_endpoint: 'https://contra.com/api/mcp/oauth/authorize',
  token_endpoint: 'https://contra.com/api/mcp/oauth/token',
  registration_endpoint: 'https://contra.com/api/mcp/oauth/register',
  code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
};
const json = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('PKCE uses a random verifier and matching SHA-256 challenge', () => {
  const a = createPkce(), b = createPkce();
  assert.notEqual(a.verifier, b.verifier);
  assert.equal(a.challenge, crypto.createHash('sha256').update(a.verifier).digest('base64url'));
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/);
});

test('OAuth discovery rejects cross-origin endpoints and missing S256', async () => {
  assert.deepEqual(await discoverOAuth(async () => json(metadata)), metadata);
  await assert.rejects(discoverOAuth(async () => json({ ...metadata, token_endpoint: 'https://example.com/token' })), /trusted/);
  await assert.rejects(discoverOAuth(async () => json({ ...metadata, code_challenge_methods_supported: ['plain'] })), /S256/);
});

test('callback binds loopback; invalid state, host, path and method do not consume the login', async (t) => {
  let calls = 0;
  const callback = await listenForCallback({ state: 'fixture-state', port: 0, onCode: async (code) => { calls++; return code; } });
  t.after(() => callback.close());
  assert.match(callback.redirectUri, /^http:\/\/127\.0\.0\.1:/);
  for (const query of ['code=x', 'code=x&state=wrong', 'code=x&state=fixture-state&state=fixture-state']) {
    assert.equal((await fetch(`${callback.redirectUri}?${query}`)).status, 400);
  }
  assert.equal((await fetch(callback.redirectUri, { headers: { Host: 'evil.example' } })).status, 400);
  assert.equal((await fetch(callback.redirectUri, { method: 'POST' })).status, 405);
  assert.equal((await fetch(callback.redirectUri.replace('/callback', '/favicon.ico'))).status, 404);
  assert.equal(calls, 0);
  const response = await fetch(`${callback.redirectUri}?code=fixture-code&state=fixture-state`);
  assert.equal(response.status, 200);
  assert.equal(await callback.received, 'fixture-code'); assert.equal(calls, 1);
});

test('callback denial and exchange failure never display success or reflect input', async (t) => {
  const denied = await listenForCallback({ state: 'x', port: 0, onCode: async () => assert.fail('must not exchange') });
  t.after(() => denied.close());
  const denial = await fetch(`${denied.redirectUri}?state=x&error=%3Cscript%3Esecret%3C/script%3E`);
  assert.equal(denial.status, 400); assert.equal((await denial.text()).includes('secret'), false);
  await assert.rejects(denied.received, /declined/);
  const failed = await listenForCallback({ state: 'x', port: 0, onCode: async () => { throw new Error('fixture exchange failed'); } });
  t.after(() => failed.close());
  assert.equal((await fetch(`${failed.redirectUri}?state=x&code=test`)).status, 500);
  await assert.rejects(failed.received, /exchange failed/);
});

test('callback expires and releases its listener', async () => {
  const callback = await listenForCallback({ state: 'x', port: 0, timeoutMs: 20, onCode: async () => {} });
  await assert.rejects(callback.received, /timed out/);
  await assert.rejects(fetch(callback.redirectUri));
  callback.close();
});

test('full OAuth flow uses matching redirect/state/PKCE and verifies whoami with fixture data', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contra-auth-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tokenPath = path.join(dir, 'token.json');
  let registration, authUrl, tokenCalls = 0;
  const messages = [];
  const fetchImpl = async (url, options) => {
    if (url.endsWith('oauth-authorization-server')) return json(metadata);
    if (url.endsWith('/register')) { registration = JSON.parse(options.body); return json({ client_id: 'fixture-client' }); }
    if (url.endsWith('/token')) {
      tokenCalls++;
      const params = new URLSearchParams(options.body);
      assert.equal(params.get('code'), 'fixture-code');
      assert.equal(params.get('redirect_uri'), registration.redirect_uris[0]);
      assert.equal(crypto.createHash('sha256').update(params.get('code_verifier')).digest('base64url'), authUrl.searchParams.get('code_challenge'));
      return json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 });
    }
    const body = JSON.parse(options.body);
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = body.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} } }
      : { structuredContent: { visitor: { userAccount: { profile: { displayUsername: 'fixture-person' } } } } };
    assert.ok(['initialize', 'tools/call'].includes(body.method));
    if (body.method === 'tools/call') assert.equal(body.params.name, 'whoami');
    return json({ jsonrpc: '2.0', id: body.id, result });
  };
  const authorize = async (url) => {
    authUrl = new URL(url);
    assert.ok(authUrl.searchParams.get('state'));
    const callback = new URL(authUrl.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'fixture-code', state: authUrl.searchParams.get('state') }).toString();
    const response = await fetch(callback);
    assert.equal(response.status, 200);
    return true;
  };
  assert.deepEqual(await runAuth({ fetchImpl, authorize, tokenPath, port: 0, log: (text) => messages.push(text) }), { verified: true });
  assert.equal(tokenCalls, 1);
  assert.equal(messages.join('').includes('fixture-access'), false);
  assert.deepEqual(fs.readdirSync(dir), ['token.json']);
  assert.ok(JSON.parse(fs.readFileSync(tokenPath)).expires_at);
});

test('duplicate valid callback cannot exchange the code twice', async (t) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const callback = await listenForCallback({ state: 'x', port: 0, onCode: async () => { calls++; await pending; } });
  t.after(() => callback.close());
  const first = fetch(`${callback.redirectUri}?state=x&code=test`);
  // Wait until the first request is actually being processed.
  while (!calls) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await fetch(`${callback.redirectUri}?state=x&code=test`)).status, 409);
  release();
  assert.equal((await first).status, 200); await callback.received;
  assert.equal(calls, 1);
});
