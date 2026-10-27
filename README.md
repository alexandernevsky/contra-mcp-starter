# Contra MCP Starter Toolkit

A zero-dependency Node.js client, OAuth helper and content templates for working with [Contra's official remote MCP](https://contra.com/features/mcp).

[English](README.md) · [Русский](README.ru.md)

**For Codex and other OAuth-capable AI clients, connect directly to `https://contra.com/mcp`.** This repository is useful for JavaScript scripts, repeatable content workflows and local tests. It is a client library, **not a stdio MCP server**.

## Connect Codex

Use a current Codex installation with remote MCP and OAuth support:

```bash
codex mcp add contra --url https://contra.com/mcp
```

Complete the browser authorization if prompted. Otherwise start it explicitly:

```bash
codex mcp login contra
codex mcp list
```

Codex manages its own OAuth credentials and renewal. You do not need `npm run auth`, a copied Bearer token or this repository's token file for this route.

Alternatively add the following to `~/.codex/config.toml` (or a trusted project's `.codex/config.toml`), then run `codex mcp login contra`:

```toml
[mcp_servers.contra]
url = "https://contra.com/mcp"
# Start with the three read operations used by this toolkit.
enabled_tools = ["whoami", "list_services", "list_portfolio_projects"]
```

[Example config](.agents/codex.config.example.toml). Reload the client/session if the new tools do not appear. The allowlist intentionally excludes writes; broaden it only for a reviewed task and after checking the current tool schemas. Host tool approvals and the Contra prepare/confirm workflow still apply.

First prompt:

> Read AGENTS.md. Use Contra only to verify my identity and inspect my services and published portfolio. Do not prepare drafts, confirm changes, send messages or perform financial operations. Report missing access rather than changing account settings.

See the [official Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp) and [CLI reference](https://learn.chatgpt.com/docs/developer-commands). Commands were also checked against the locally installed CLI on 2026-10-27; the SDK OAuth flow was subsequently verified live. Native Codex sign-in was not run.

## Other AI clients

- **Claude Code:** `claude mcp add --transport http contra https://contra.com/mcp`, then authenticate through `/mcp`. See [Claude's guide](https://code.claude.com/docs/en/mcp).
- **Claude Desktop / web:** use the remote connector UI with `https://contra.com/mcp` where your plan/admin policy allows custom connectors. Do not launch `scripts/contra-client.mjs` as a server.
- **Cursor:** configure a remote URL in `.cursor/mcp.json`, then complete OAuth in Cursor. See [Cursor's MCP guide](https://cursor.com/docs/mcp).

```json
{
  "mcpServers": {
    "contra": { "url": "https://contra.com/mcp" }
  }
}
```

Windsurf and other clients should use Contra's [current installation guide](https://contra.com/features/mcp) for their own configuration format. The legacy Antigravity `serverUrl` example is in [.agents/mcp_config.example.json](.agents/mcp_config.example.json); verify OAuth support in your installed version. The SDK does not synchronize credentials with any editor. A static Bearer header will expire and must not be presented as an auto-refreshing integration.

## JavaScript SDK and CLI

Use Node.js 18.20+ with native `fetch`; use a maintained Node release in practice. No package installation is needed.

```bash
git clone https://github.com/alexandernevsky/contra-mcp-starter.git
cd contra-mcp-starter
npm test              # Offline regression tests; no Contra credentials needed
npm run auth          # Registers an OAuth client and opens the consent page
npm run health        # Read-only account smoke test; no prepare/confirm
npm run tools         # Current tool names and input schemas (all catalog pages)
npm run whoami
npm run services
npm run projects
```

`auth` changes authorization state: run it only when you intend to connect the SDK. It uses PKCE S256, a random checked state and a five-minute callback window. It listens on `127.0.0.1:4567`; set `PORT` to another port (or `0` for an available port) if needed. Success is reported only after token exchange and `whoami` verification. It never edits global Codex, Antigravity or other editor configuration.

SDK credentials resolve in this order:

1. `CONTRA_TOKEN_PATH`, if set (an explicit missing file is an error).
2. `contra_token.json` in this checkout.
3. The legacy `~/.gemini/config/contra_token.json`, if present.

`auth` writes to `CONTRA_TOKEN_PATH` or this checkout's `contra_token.json`. Atomic writes use mode `0600` on POSIX. Windows users should restrict the file's ACL. Keep credentials out of Git, chat, screenshots and backups shared with others. The token file is plain text, not a credential vault. No tokens are copied from a native AI client's credential store.

The SDK refreshes after one HTTP 401 and retries that request once. Refresh failures preserve the existing file and require a new authorized login. Concurrent refreshes are coalesced within one process; use **one process per token file**, since cross-process refresh rotation is not coordinated. Old editor Bearer headers are not updated. The client does not replay requests after 429, network errors, timeouts or 5xx responses: inspect the account before retrying a write with an uncertain outcome.

```js
import { ContraClient } from './scripts/contra-client.mjs';

const client = new ContraClient();
const tools = await client.listTools();
const me = await client.callTool('whoami');
```

The transport initializes MCP, sends the initialized notification, propagates session IDs and negotiated protocol versions, and accepts JSON or SSE. It requests protocol `2025-03-26` and accepts `2025-03-26`, `2025-06-18` and `2025-11-25`. Unsupported versions fail explicitly. Requests have a 30-second timeout covering headers and body, and a 16 MiB response limit. This is a bounded tools client, not a general MCP host with sampling, elicitation or persistent server-push support.

## Prepare, review, then confirm

Contra documents a two-step mutation flow and a 15-minute draft lifetime. A prepare call creates server-side draft state; it is **not an offline dry run**. A request to inspect or test does not authorize prepare, confirm, publishing, messaging or payments.

`callTool` / `callContraTool` permit only `whoami`, `list_services` and `list_portfolio_projects` by default. Any other tool requires `{ allowMutation: true }`. This is a caller opt-in guard, not proof of human approval or a security sandbox. The underlying transport and native AI clients are not governed by that SDK allowlist.

For an owner-authorized update:

1. Discover the current schemas with `npm run tools` and read the target entity.
2. Prepare only the requested changes with an explicit `allowMutation: true` option.
3. Show all before/after fields and obtain approval for that exact preview.
4. Confirm in a **separate** call using the returned draft ID and live schema.
5. Read the entity back. If the draft expired or the preview changed, prepare again and get approval for the new preview.

Preparation example (arguments come from the live schema and the owner's request):

```js
const draft = await client.callTool(
  'update_productized_service_prepare',
  reviewedUpdateArguments,
  { allowMutation: true },
);
console.log(draft); // Review locally; do not put account data into public logs.
// Stop here for review. There is deliberately no automatic confirm call.
```

The standalone [prepare example](scripts/examples/prepare-service-update.mjs) requires `--prepare SERVICE_SLUG`, never selects the first service and never confirms. An empty update may be rejected by the current schema; it is not a health check.

Treat arrays and content blocks as full replacements unless the current schema says otherwise. Preserve omitted data and stable entity IDs. Templates contain example copy and prices, not facts or permission to publish them.

## Current Contra capabilities and verification

The official [Contra MCP page](https://contra.com/features/mcp) describes profile/portfolio workflows, services, hiring, messaging, invoices and payment links. Do not hardcode a tool count: `tools/list` for the authenticated account is authoritative. The older README's “119 tools” was a historical observation, not a compatibility contract.

Claims about video covers, profile tags, slug formats and editing community posts also need live-schema verification. The original toolkit observed restrictions in these areas; do not assume a missing capability forever, invent an API, or silently fall back to browser writes.

See [verification notes](docs/VERIFICATION.md) for the dated evidence and limitations. `npm test` is offline; `npm run health` is a separate live read-only check and returns only counts and verification flags. `npm run projects` includes draft projects and returns at most 25 entries; health checks published projects only, up to 10. Neither claims a complete portfolio export.

- [Agent rules](AGENTS.md)
- [English prompts](PROMPTS.md) / [Russian prompts](PROMPTS.ru.md)
- [Profile template](templates/profile.example.md), [services template](templates/services.example.md), [case study template](templates/case-study.example.md)
- [Changes](CHANGELOG.md)

## License

MIT © 2026 Alexander Nevsky. Independent community toolkit; not an official Contra SDK.
