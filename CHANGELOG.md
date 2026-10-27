# Changelog

## 1.1.0 — unreleased

- Document native remote OAuth for Codex, Claude Code/Desktop and Cursor. Remove the incorrect stdio launcher and static-token default; stop modifying global editor configuration.
- Verify OAuth state and PKCE, bind callbacks to loopback, bound callback waiting, suppress untrusted error text and report failures with a nonzero exit status.
- Save credentials atomically with owner-only POSIX permissions. Keep explicit/local/legacy token-path resolution and coalesce refreshes within one process.
- Initialize MCP sessions; handle JSON and incremental SSE, session/protocol headers, response IDs, catalog pagination, timeouts and response limits.
- Restrict high-level tool calls to three read tools by default. **Compatibility change:** other tools now need explicit `{ allowMutation: true }`; human preview approval is still required separately. The legacy boolean third argument remains a read-call retry flag.
- Set the Node minimum to 18.20 for the callback and test-runner APIs; validation used the existing Node 22.23.2 installation.
- Make `npm test` offline. Add live read-only `health` and catalog `tools` commands. Require an explicit target and flag for the prepare example.
- Replace permanent tool-count/media claims with schema discovery and dated verification evidence.

## 1.0.0 — 2026-09-16

Initial OAuth helper, client, agent instructions and content templates.
