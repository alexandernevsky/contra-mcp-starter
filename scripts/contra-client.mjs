import { readToken, resolveTokenPath, writeToken } from './token-store.mjs';
import { fetchJson, readRpcResponse, withTimeout } from './http.mjs';

export const MCP_URL = 'https://contra.com/mcp';
export const TOKEN_URL = 'https://contra.com/api/mcp/oauth/token';
export const CLIENT_VERSION = '1.1.0';
const SUPPORTED_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'];
const READ_TOOLS = new Set(['whoami', 'list_services', 'list_portfolio_projects']);
const refreshes = new Map();

export function getTokenPath() { return resolveTokenPath(); }
export function getTokenData() { return readToken(getTokenPath()); }
export function getAccessToken() { return getTokenData().access_token; }

// Coalesce refreshes for clients sharing a token file in this process.
// Run only one process per token file (refresh tokens may rotate).
export async function refreshAccessToken({ tokenPath = getTokenPath(), fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  if (refreshes.has(tokenPath)) return refreshes.get(tokenPath);
  const pending = (async () => {
    const previous = readToken(tokenPath);
    if (!previous.refresh_token || !previous.client_id) {
      throw new Error('Missing refresh token or client ID. Run npm run auth to reconnect.');
    }
    const data = await fetchJson(fetchImpl, TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: previous.client_id, refresh_token: previous.refresh_token }).toString(),
    }, timeoutMs, 'Token refresh');
    if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Token refresh returned no access token.');
    if (data.token_type && data.token_type.toLowerCase() !== 'bearer') throw new Error('Unsupported OAuth token type.');
    const next = { ...previous, access_token: data.access_token, updated_at: new Date().toISOString() };
    if (typeof data.refresh_token === 'string' && data.refresh_token) next.refresh_token = data.refresh_token;
    delete next.expires_at;
    delete next.expires_in;
    if (Number.isFinite(data.expires_in) && data.expires_in > 0) {
      next.expires_in = data.expires_in;
      next.expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    }
    writeToken(tokenPath, next);
    return next.access_token;
  })();
  refreshes.set(tokenPath, pending);
  try { return await pending; } finally { refreshes.delete(tokenPath); }
}

export class ContraClient {
  constructor({ tokenPath, fetchImpl = fetch, timeoutMs = 30000 } = {}) {
    this.tokenPath = tokenPath;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.nextId = 0;
    this.sessionId = undefined;
    this.protocolVersion = undefined;
    this.initializing = undefined;
  }

  async send(method, params, { notification = false, retryOn401 = true } = {}) {
    const tokenPath = this.tokenPath ?? resolveTokenPath();
    const id = notification ? undefined : ++this.nextId;
    const message = { jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }), ...(notification ? {} : { id }) };
    let token = readToken(tokenPath).access_token;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await withTimeout(this.timeoutMs, async (signal) => {
        let response;
        try {
          response = await this.fetch(MCP_URL, {
            method: 'POST', redirect: 'error', signal,
            headers: {
              'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`,
              ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
              ...(this.protocolVersion ? { 'MCP-Protocol-Version': this.protocolVersion } : {}),
            }, body: JSON.stringify(message),
          });
        } catch { throw new Error('Contra MCP network request failed. No tool call was automatically replayed.'); }
        if (response.status === 401) { await response.body?.cancel(); return { unauthorized: true }; }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Contra MCP HTTP ${response.status}. Inspect the account state before retrying a mutation.`);
        }
        const session = response.headers.get('mcp-session-id');
        if (method === 'initialize' && session) this.sessionId = session;
        if (notification) {
          await response.body?.cancel();
          if (response.status !== 202 && response.status !== 204) throw new Error('MCP notification was not acknowledged.');
          return {};
        }
        return { payload: await readRpcResponse(response, id) };
      });
      if (result.unauthorized) {
        if (attempt || !retryOn401) throw new Error('Contra MCP HTTP 401. Reconnect with npm run auth.');
        const current = readToken(tokenPath).access_token;
        token = current !== token ? current : await refreshAccessToken({ tokenPath, fetchImpl: this.fetch, timeoutMs: this.timeoutMs });
        continue;
      }
      return result.payload?.result;
    }
  }

  async initialize({ retryOn401 = true } = {}) {
    if (!this.initializing) {
      this.initializing = (async () => {
        const result = await this.send('initialize', {
          protocolVersion: SUPPORTED_VERSIONS[0], capabilities: {},
          clientInfo: { name: 'contra-mcp-starter', version: CLIENT_VERSION },
        }, { retryOn401 });
        if (!SUPPORTED_VERSIONS.includes(result?.protocolVersion)) throw new Error('Unsupported MCP protocol version returned by Contra.');
        if (!result.capabilities?.tools) throw new Error('Contra did not advertise MCP tools.');
        this.protocolVersion = result.protocolVersion;
        await this.send('notifications/initialized', undefined, { notification: true, retryOn401 });
        return result;
      })();
      this.initializing.catch(() => { this.initializing = undefined; this.sessionId = undefined; this.protocolVersion = undefined; });
    }
    return this.initializing;
  }

  async listTools() {
    await this.initialize();
    const tools = [];
    const seen = new Set();
    let cursor;
    do {
      const page = await this.send('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(page?.tools)) throw new Error('Invalid tools/list response.');
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor !== undefined && cursor !== null && typeof cursor !== 'string') throw new Error('Invalid tools/list cursor.');
      if (cursor && seen.has(cursor)) throw new Error('Repeated tools/list cursor.');
      if (cursor) seen.add(cursor);
      if (seen.size > 100) throw new Error('Too many tools/list pages.');
    } while (cursor);
    return tools;
  }

  async callTool(name, args = {}, { allowMutation = false, retryOn401 = true } = {}) {
    // An explicit allowlist is intentional: names and annotations alone cannot
    // prove a new tool is read-only. Review the live schema before opting in.
    if (!READ_TOOLS.has(name) && allowMutation !== true) {
      throw new Error('Tool is outside the read-only allowlist. Review its schema and obtain approval before setting allowMutation: true.');
    }
    await this.initialize({ retryOn401 });
    const result = await this.send('tools/call', { name, arguments: args }, { retryOn401 });
    if (!result || result.isError) throw new Error(`Contra tool ${name} failed. Response content omitted to protect account data.`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    const text = result.content?.find((item) => item.type === 'text')?.text;
    if (text !== undefined) { try { return JSON.parse(text); } catch { return text; } }
    return result;
  }
}

const defaultClient = new ContraClient();
export function callContraTool(name, args = {}, options = {}) {
  // Preserve the old third-argument retry flag for read calls.
  return defaultClient.callTool(name, args, typeof options === 'boolean' ? { retryOn401: options } : options);
}
export function listTools() { return defaultClient.listTools(); }
export function whoami() { return callContraTool('whoami'); }
export function listServices(username) { return callContraTool('list_services', { username }); }
export function listPortfolioProjects(username, options = {}) {
  return callContraTool('list_portfolio_projects', { username, includeDrafts: options.includeDrafts ?? false, limit: options.limit ?? 10 });
}
