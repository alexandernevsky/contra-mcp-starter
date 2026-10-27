#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { LOCAL_TOKEN_PATH, writeToken } from './token-store.mjs';
import { fetchJson } from './http.mjs';
import { ContraClient } from './contra-client.mjs';

export const METADATA_URL = 'https://contra.com/.well-known/oauth-authorization-server';

export async function discoverOAuth(fetchImpl = fetch) {
  const metadata = await fetchJson(fetchImpl, METADATA_URL, {}, 30000, 'OAuth discovery');
  for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
    let endpoint;
    try { endpoint = new URL(metadata[key]); } catch { throw new Error(`Missing OAuth ${key}.`); }
    if (endpoint.origin !== 'https://contra.com' || endpoint.username || endpoint.password || endpoint.hash) {
      throw new Error('OAuth endpoint must use the trusted https://contra.com origin.');
    }
  }
  if (!metadata.code_challenge_methods_supported?.includes('S256')) throw new Error('Contra must support PKCE S256.');
  if (!metadata.token_endpoint_auth_methods_supported?.includes('none')) throw new Error('Public OAuth clients are not supported.');
  return metadata;
}

export function createPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

function stateMatches(actual, expected) {
  if (!actual) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function listenForCallback({ state, onCode, port = 4567, timeoutMs = 300000 }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  let resolve, reject, timer, consumed = false;
  const received = new Promise((yes, no) => { resolve = yes; reject = no; });
  received.catch(() => {}); // Caller may still be performing discovery/registration.
  let redirectUri;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    const reply = (status, text) => { res.writeHead(status); res.end(text); };
    if (req.headers.host !== new URL(redirectUri).host) return reply(400, 'Invalid callback host.');
    if (req.method !== 'GET') return reply(405, 'Use GET.');
    let url;
    try { url = new URL(req.url, redirectUri); } catch { return reply(400, 'Invalid callback URL.'); }
    if (url.pathname !== '/callback') return reply(404, 'Not found.');
    if (consumed) return reply(409, 'Callback already handled.');
    if (url.searchParams.getAll('state').length !== 1 || !stateMatches(url.searchParams.get('state'), state)) {
      return reply(400, 'Invalid OAuth state.');
    }
    if (url.searchParams.has('error')) {
      consumed = true; clearTimeout(timer);
      reply(400, 'Contra authorization was declined or failed.');
      reject(new Error('Contra authorization was declined or failed.'));
      server.close();
      return;
    }
    if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code')) return reply(400, 'Missing authorization code.');
    consumed = true; clearTimeout(timer);
    try {
      const result = await onCode(url.searchParams.get('code'), url.searchParams.get('iss'));
      reply(200, 'Contra connection verified. You can close this tab.');
      resolve(result);
    } catch (error) {
      reply(500, 'Contra connection failed. Check the terminal; no success was recorded.');
      reject(error);
    } finally { server.close(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); });
  redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
  timer = setTimeout(() => {
    consumed = true;
    reject(new Error('OAuth callback timed out. Run npm run auth to try again.'));
    server.close(); server.closeAllConnections();
  }, timeoutMs);
  return {
    redirectUri, received,
    close() { clearTimeout(timer); consumed = true; server.close(); server.closeAllConnections(); reject(new Error('OAuth callback closed.')); },
  };
}

export async function openBrowser(url) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  return new Promise((resolve) => execFile(command, args, (error) => resolve(!error)));
}

export async function runAuth({ fetchImpl = fetch, authorize = openBrowser, tokenPath = process.env.CONTRA_TOKEN_PATH || LOCAL_TOKEN_PATH, port = Number(process.env.PORT ?? 4567), log = console.log } = {}) {
  const pkce = createPkce();
  const state = crypto.randomBytes(32).toString('base64url');
  let metadata, clientId;
  const callback = await listenForCallback({ state, port, onCode: async (code, issuer) => {
    if (!metadata || !clientId) throw new Error('OAuth flow is not ready.');
    if (metadata.authorization_response_iss_parameter_supported && issuer !== metadata.issuer) throw new Error('OAuth issuer mismatch.');
    const token = await fetchJson(fetchImpl, metadata.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: callback.redirectUri, code_verifier: pkce.verifier }).toString(),
    }, 30000, 'Token exchange');
    if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Token exchange returned no access token.');
    if (token.token_type && token.token_type.toLowerCase() !== 'bearer') throw new Error('Unsupported OAuth token type.');
    const saved = { access_token: token.access_token, client_id: clientId, created_at: new Date().toISOString() };
    if (typeof token.refresh_token === 'string' && token.refresh_token) saved.refresh_token = token.refresh_token;
    if (Number.isFinite(token.expires_in) && token.expires_in > 0) {
      saved.expires_in = token.expires_in;
      saved.expires_at = new Date(Date.now() + token.expires_in * 1000).toISOString();
    }
    writeToken(tokenPath, saved);
    // No global editor config is read or changed. The SDK owns only this file.
    const me = await new ContraClient({ tokenPath, fetchImpl }).callTool('whoami');
    if (!me?.visitor?.userAccount?.profile?.displayUsername) throw new Error('Token saved, but whoami identity could not be verified.');
    return { verified: true };
  } });
  try {
    metadata = await discoverOAuth(fetchImpl);
    const registration = await fetchJson(fetchImpl, metadata.registration_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Contra MCP Starter Toolkit', redirect_uris: [callback.redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'mcp:tools' }),
    }, 30000, 'OAuth registration');
    if (typeof registration.client_id !== 'string' || !registration.client_id) throw new Error('OAuth registration returned no client ID.');
    clientId = registration.client_id;
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: callback.redirectUri, scope: 'mcp:tools', code_challenge: pkce.challenge, code_challenge_method: 'S256', state }).toString();
    log('Authorize Contra in your browser. Waiting for the local callback.');
    if (!await authorize(url.href)) log(`Open this authorization URL locally: ${url.href}`);
    await callback.received;
    log('Contra identity verified. SDK token saved with owner-only POSIX permissions.');
    return { verified: true };
  } finally { callback.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runAuth().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
