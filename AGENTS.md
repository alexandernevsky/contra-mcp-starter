# AGENTS.md — Contra MCP AI Agent Guidelines

This document provides mandatory operational rules for AI coding assistants (Google Antigravity, Cursor, Windsurf, Claude Code, GitHub Copilot Workspace) interacting with Contra via Model Context Protocol (MCP).

---

## 1. Safety & Execution Protocol

Contra MCP utilizes a strict **two-phase commit protocol** for all mutating operations:

```text
1. Prepare Phase   ---> 2. Human Review Phase ---> 3. Confirm Phase
(xxx_prepare tool)       (Present full diff)       (xxx_confirm tool)
```

### Golden Rules:
1. **Never call a `confirm` tool without explicit human approval**:
   - Always run the matching `prepare` tool first (`update_profile_prepare`, `update_productized_service_prepare`, `create_portfolio_project_prepare`, etc.).
   - Inspect the returned `preview.changes` or `preview.summary` array.
   - Present every single modified field to the user in human-readable before/after format.
   - Wait for the user to explicitly say "yes", "confirm", or "proceed" before calling `xxx_confirm`.
2. **Drafts have a 15-minute time-to-live (TTL)**:
   - If user confirmation is delayed, re-run the `prepare` tool immediately prior to confirmation to ensure the draft ID is valid.
3. **Respect Full-Replacement Fields**:
   - In Contra MCP, certain list fields act as **full replacements**:
     - Services: `deliverables`, `faqs`, `tags`, `relatedPortfolioProjectIds`.
     - Projects: `roles`, `tools`, `collaborators`, `organizations`, `industries`, `content`.
   - Passing an array replaces the entire existing list on Contra. **Omitting the field preserves the existing list untouched.**
   - To update one item, always fetch existing items first and send the complete combined list.

---

## 2. Media & Asset Rules

1. **Cover Images**:
   - `coverImageUrl` must be a publicly accessible HTTP/HTTPS URL (e.g. from a CDN, GitHub raw asset, or live website). Local paths and base64 strings are rejected.
   - Contra automatically ingests public URLs and mirrors them onto its Cloudinary CDN.
2. **Cover Videos (MP4)**:
   - The MCP `coverImageUrl` endpoint routes to Cloudinary's image upload API and **rejects MP4 video files**.
   - Cover videos must be uploaded manually by the user in the Contra web editor (`contra.com/username`).
   - For inline videos in project body text (`content`), standard YouTube and Vimeo URLs placed on their own line are automatically embedded.

---

## 3. Profile & Entity Roles

- **Profile Tags**: Roles and tools displayed at the top of a profile cannot be edited directly on the profile entity. They are derived automatically by Contra from published portfolio projects and active services.
- **Slugs & URLs**: Project and service slugs start with an 8-character unique NanoID (`cO2eXAUv-...`). This prefix is Contra's database lookup key and cannot be removed. The text after the hyphen is derived automatically from the `title`.
- **Work Posts vs Case Studies**:
  - `projects` are full portfolio case studies (`contra.com/p/...`) and support complete MCP CRUD operations.
  - `workPosts` are community social posts (`contra.com/community/...`) and **cannot be edited via MCP**.

---

## 4. Environment & Authentication

- Tokens are stored in `contra_token.json` (or `~/.gemini/config/contra_token.json`).
- If an HTTP 401 is encountered, use `refreshAccessToken()` in `scripts/contra-client.mjs` to exchange the `refresh_token` for a fresh 1-hour access token automatically.
- Never print raw access tokens or refresh tokens in user-facing responses or logs.
