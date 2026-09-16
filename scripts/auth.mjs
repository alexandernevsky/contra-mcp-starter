#!/usr/bin/env node
/**
 * Contra MCP Interactive OAuth 2.0 PKCE Authenticator
 *
 * Automates the dynamic client registration, PKCE challenge generation,
 * local callback server, and token exchange for Contra Model Context Protocol.
 *
 * Zero external dependencies — runs on native Node.js 18+.
 */

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const TOKEN_PATH = path.join(ROOT_DIR, "contra_token.json");

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4567;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const REGISTER_URL = "https://contra.com/api/mcp/oauth/register";
const AUTH_URL = "https://contra.com/api/mcp/oauth/authorize";
const TOKEN_URL = "https://contra.com/api/mcp/oauth/token";
const MCP_URL = "https://contra.com/mcp";

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function openBrowser(url) {
  const start =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";
  exec(`${start} "${url}"`, (err) => {
    if (err) {
      console.log("\nPlease open this URL manually in your browser:\n", url);
    }
  });
}

async function main() {
  console.log("\n🚀 Contra MCP OAuth 2.0 Authenticator\n");
  console.log("1/4 Registering dynamic OAuth client with Contra...");

  const regRes = await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Contra MCP Starter Toolkit",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    }),
  });

  if (!regRes.ok) {
    throw new Error(`Client registration failed [HTTP ${regRes.status}]: ${await regRes.text()}`);
  }

  const regData = await regRes.json();
  const clientId = regData.client_id;
  console.log(`✓ Dynamic client registered (Client ID: ${clientId})`);

  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const authParams = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "mcp:tools",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const fullAuthUrl = `${AUTH_URL}?${authParams.toString()}`;

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    if (reqUrl.pathname === "/callback") {
      const code = reqUrl.searchParams.get("code");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
            <h1 style="color: #ef4444;">OAuth Error: ${error}</h1>
            <p>You can close this tab and check your terminal.</p>
          </body>
        `);
        console.error("❌ OAuth returned error:", error);
        server.close();
        process.exit(1);
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>No authorization code received</h1>");
        server.close();
        process.exit(1);
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
          <h1 style="color: #10b981;">✓ Contra MCP Authorization Successful!</h1>
          <p style="font-size: 18px; color: #94a3b8;">You can now close this tab and return to your terminal or AI editor.</p>
        </body>
      `);

      console.log("3/4 Authorization code received. Exchanging for access token...");
      try {
        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
          }).toString(),
        });

        if (!tokenRes.ok) {
          throw new Error(`Token exchange failed [HTTP ${tokenRes.status}]: ${await tokenRes.text()}`);
        }

        const tokenData = await tokenRes.json();
        tokenData.client_id = clientId;
        tokenData.created_at = new Date().toISOString();

        // Write to project root
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2), "utf8");
        console.log(`✓ Token saved securely to ${TOKEN_PATH}`);

        // Update ~/.gemini/config/mcp_config.json if running in Antigravity
        const geminiMcpConfig = path.join(process.env.HOME || "", ".gemini/config/mcp_config.json");
        if (fs.existsSync(geminiMcpConfig)) {
          try {
            const config = JSON.parse(fs.readFileSync(geminiMcpConfig, "utf8"));
            config.mcpServers = config.mcpServers || {};
            config.mcpServers.contra = {
              serverUrl: MCP_URL,
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
              },
            };
            fs.writeFileSync(geminiMcpConfig, JSON.stringify(config, null, 2), "utf8");
            console.log("✓ Updated global Antigravity MCP config (~/.gemini/config/mcp_config.json)");
          } catch (e) {
            // Ignore optional config update
          }
        }

        console.log("\n4/4 Verifying connection via whoami...");
        const whoamiRes = await fetch(MCP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": `Bearer ${tokenData.access_token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name: "whoami", arguments: {} },
            id: 1,
          }),
        });

        const raw = await whoamiRes.text();
        const match = raw.match(/data:\s*({[\s\S]*})/);
        if (match) {
          const payload = JSON.parse(match[1]);
          const me = payload.result?.structuredContent || payload.result;
          const username = me?.visitor?.userAccount?.profile?.displayUsername;
          if (username) {
            console.log(`🎉 Authenticated successfully as @${username}!`);
          } else {
            console.log("🎉 Connection verified!");
          }
        }

        console.log("\n✨ Setup complete! You can now run:\n  npm run services\n  npm run projects\n");
      } catch (err) {
        console.error("❌ Error completing authentication:", err.message);
      } finally {
        server.close();
        process.exit(0);
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`2/4 Waiting for authorization callback on port ${PORT}...`);
    console.log(`Opening Contra authorization page in your browser:\n${fullAuthUrl}\n`);
    openBrowser(fullAuthUrl);
  });
}

main().catch((err) => {
  console.error("❌ Fatal setup error:", err.message);
  process.exit(1);
});
