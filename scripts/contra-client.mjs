import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const LOCAL_TOKEN_PATH = path.join(ROOT_DIR, "contra_token.json");
const GLOBAL_TOKEN_PATH = path.join(process.env.HOME || "", ".gemini/config/contra_token.json");

const MCP_URL = "https://contra.com/mcp";
const TOKEN_URL = "https://contra.com/api/mcp/oauth/token";

export function getTokenPath() {
  if (fs.existsSync(LOCAL_TOKEN_PATH)) return LOCAL_TOKEN_PATH;
  if (fs.existsSync(GLOBAL_TOKEN_PATH)) return GLOBAL_TOKEN_PATH;
  throw new Error(
    "Contra token not found. Please run 'npm run auth' first to authenticate your account."
  );
}

export function getTokenData() {
  const p = getTokenPath();
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function getAccessToken() {
  return getTokenData().access_token;
}

export async function refreshAccessToken() {
  const tokenPath = getTokenPath();
  const tokenData = getTokenData();

  if (!tokenData.refresh_token || !tokenData.client_id) {
    throw new Error(
      "Missing refresh_token or client_id. Please run 'npm run auth' to re-authenticate."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: tokenData.client_id,
      refresh_token: tokenData.refresh_token,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed [HTTP ${res.status}]: ${await res.text()}`);
  }

  const data = await res.json();
  if (data.access_token) {
    tokenData.access_token = data.access_token;
    if (data.refresh_token) tokenData.refresh_token = data.refresh_token;
    tokenData.updated_at = new Date().toISOString();
    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), "utf8");
  }
  return tokenData.access_token;
}

export async function callContraTool(name, args = {}, retryOn401 = true) {
  let token = getAccessToken();

  let res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name, arguments: args },
      id: Date.now(),
    }),
  });

  if (res.status === 401 && retryOn401) {
    console.log("Session expired (HTTP 401). Automatically refreshing Contra token...");
    token = await refreshAccessToken();
    res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name, arguments: args },
        id: Date.now(),
      }),
    });
  }

  if (!res.ok) {
    throw new Error(`Contra MCP HTTP error [${res.status}]: ${await res.text()}`);
  }

  const raw = await res.text();
  const match = raw.match(/data:\s*({[\s\S]*})/);
  if (!match) {
    throw new Error(`Malformed MCP SSE response: ${raw}`);
  }

  const payload = JSON.parse(match[1]);
  if (payload.error) {
    throw new Error(`Contra MCP Error [${payload.error.code}]: ${payload.error.message}`);
  }

  const result = payload.result;
  if (result.isError) {
    throw new Error(`Contra Tool Error: ${JSON.stringify(result.content)}`);
  }

  if (result.structuredContent) {
    return result.structuredContent;
  }

  const textBlock = result.content?.find((c) => c.type === "text");
  if (textBlock?.text) {
    try {
      return JSON.parse(textBlock.text);
    } catch {
      return textBlock.text;
    }
  }

  return result;
}

export async function whoami() {
  return callContraTool("whoami");
}

export async function listServices(username) {
  return callContraTool("list_services", { username });
}

export async function listPortfolioProjects(username, options = {}) {
  return callContraTool("list_portfolio_projects", {
    username,
    includeDrafts: options.includeDrafts ?? false,
    limit: options.limit ?? 10,
  });
}
