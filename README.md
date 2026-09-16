# Contra MCP Starter Toolkit ⚡

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/alexandernevsky/contra-mcp-starter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Contra](https://img.shields.io/badge/Platform-Contra.com-black?logo=contra)](https://contra.com)

> **Zero-dependency starter kit and automation SDK for managing your [Contra](https://contra.com) profile, flagship services, and portfolio case studies using Model Context Protocol (MCP) and AI coding agents (Google Antigravity, Cursor, Windsurf, Claude Code).**

[English](README.md) • [Русская версия](README.ru.md)

---

## Overview

[Contra](https://contra.com) is the premier commission-free platform for independent builders, product designers, and engineers. Contra natively provides a powerful **remote MCP endpoint** (`https://contra.com/mcp`) offering 119 programmatic tools to manage profiles, case studies, productized services, contracts, and proposals.

However, connecting AI agents to Contra typically involves complex OAuth 2.0 PKCE handshakes, expiring 1-hour access tokens, and navigating destructive write boundaries.

This repository provides an open-source, production-tested solution:
- **1-Click Interactive OAuth 2.0 PKCE**: Authenticates your Contra account in seconds via local callback server.
- **Zero External Dependencies**: Powered purely by native Node.js 18+ runtime (`fetch`, `crypto`, `http`).
- **Auto-Refreshing SDK Client**: Catches HTTP `401 Unauthorized` and silently renews access tokens using your `refresh_token`.
- **Two-Phase Safety Protocol (`prepare → confirm`)**: Guarantees AI coding agents never silently overwrite or mutate your public profile without human approval.
- **Content-as-Code Templates**: Ready-to-use Markdown templates for high-converting profile positioning, 3 flagship services (with monthly rates & FAQs), and structured case studies.

---

## Architecture

```text
┌────────────────────────────────────────────────────────┐
│      Your AI Coding Assistant                          │
│   (Google Antigravity / Cursor / Claude Code / Windsurf)│
└───────────────────────────┬────────────────────────────┘
                            │ (Calls MCP Tools)
                            ▼
┌────────────────────────────────────────────────────────┐
│      Local Contra SDK Client (scripts/contra-client.mjs)│
│  - Reads contra_token.json                             │
│  - Auto-refreshes expired 1-hour sessions on 401       │
│  - Implements prepare -> review -> confirm workflow     │
└───────────────────────────┬────────────────────────────┘
                            │ (Bearer Authorization)
                            ▼
┌────────────────────────────────────────────────────────┐
│      Remote Contra MCP Server (https://contra.com/mcp) │
│  - 119 Official Tools (Profile, Services, Projects...) │
│  - Cloudinary Media Pipeline                           │
└────────────────────────────────────────────────────────┘
```

---

## Quickstart (2 Minutes)

### 1. Clone the repository
```bash
git clone https://github.com/alexandernevsky/contra-mcp-starter.git
cd contra-mcp-starter
```

### 2. Authenticate with Contra
Run the zero-dependency authenticator:
```bash
npm run auth
```
This will:
1. Dynamically register a secure local OAuth client with Contra.
2. Automatically open your default browser to authorize your account.
3. Capture the OAuth callback code on `localhost:4567`.
4. Exchange the code for an `access_token` and `refresh_token`.
5. Save the token securely to `contra_token.json` (strictly git-ignored).

### 3. Verify your connection
```bash
npm run whoami
```
Output:
```text
👤 Contra Authenticated Profile

Username: @your_username
Name:     Your Name
Type:     CONTRACTOR
Profile:  https://contra.com/your_username
```

### 4. Inspect your services and portfolio
```bash
npm run services
npm run projects
```

---

## Connecting to AI Coding Agents

### 1. Google Antigravity
The authenticator script automatically detects and updates your global `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "contra": {
      "serverUrl": "https://contra.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_ACCESS_TOKEN>"
      }
    }
  }
}
```

### 2. Cursor IDE
Add the remote MCP server to your Cursor workspace settings (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "contra": {
      "url": "https://contra.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

### 3. Claude Code / Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "contra": {
      "command": "node",
      "args": ["/path/to/contra-mcp-starter/scripts/contra-client.mjs"]
    }
  }
}
```

---

## The Safety Protocol: Prepare & Confirm

Contra MCP enforces a strict two-phase commit protocol on write operations to ensure safety.

### Example: Updating a Service
```javascript
import { callContraTool } from "./scripts/contra-client.mjs";

// Step 1: Prepare draft (no database changes)
const draft = await callContraTool("update_productized_service_prepare", {
  slug: "your-service-slug",
  price: {
    type: "RATE",
    amount: 6000,
    interval: "MONTH"
  }
});

// Step 2: Human Review Phase
console.log("Review changes:", draft.preview.changes);

// Step 3: Confirm update (commits to live database)
await callContraTool("update_productized_service_confirm", {
  draftId: draft.draftId,
  confirm: true
});
```

> [!IMPORTANT]
> **Full-Replacement Fields Warning:**
> In Contra MCP, array fields (`deliverables`, `faqs`, `tags`, `roles`, `tools`) behave as **full replacements**. Passing a list replaces the entire existing list on Contra. To preserve existing items, omit the field entirely from your update.

---

## Directory Structure

```text
contra-mcp-starter/
├── AGENTS.md                  # Operational rules for AI assistants
├── README.md                  # English documentation (this file)
├── README.ru.md               # Russian documentation
├── package.json               # Zero-dependency npm scripts
├── .gitignore                 # Strict token & secret isolation
│
├── scripts/
│   ├── auth.mjs               # Interactive OAuth 2.0 PKCE CLI
│   ├── contra-client.mjs      # Auto-refreshing MCP client SDK
│   └── examples/
│       ├── whoami.mjs         # Profile inspector
│       ├── inspect-services.mjs # Services listing
│       ├── inspect-projects.mjs # Case studies & work posts listing
│       └── prepare-service-update.mjs # Safe two-phase commit demo
│
└── templates/
    ├── profile.example.md     # Bio, headline & social links template
    ├── services.example.md    # 3 flagship services architecture
    └── case-study.example.md  # High-impact case study structure
```

---

## Technical Constraints & Contra Architecture

1. **Unique Slug NanoIDs**: Every project and service on Contra begins with an 8-character ID (e.g. `cO2eXAUv-...`). This prefix is Contra's database lookup key because routes are global (`contra.com/p/...`). The text after the hyphen is automatically derived from your `title`.
2. **Cover Images vs Videos**:
   - `coverImageUrl` in MCP accepts public image URLs (PNG, JPG, WebP) and automatically mirrors them to Cloudinary.
   - Video covers (MP4) must be uploaded via the Contra web editor.
   - Videos inside project bodies (`content`) are supported via standalone YouTube and Vimeo URLs.
3. **Projects vs Work Posts**:
   - `projects` are full portfolio case studies with complete MCP CRUD support.
   - `workPosts` are community feed items and cannot be edited via MCP.

---

## Contributing

Contributions, feedback, and issue reports are welcome! Feel free to open an issue or submit a pull request.

---

## License

MIT License © 2026 [Alexander Nevsky](https://contra.com/alexander_nevsky). Built for the global independent builder community.
