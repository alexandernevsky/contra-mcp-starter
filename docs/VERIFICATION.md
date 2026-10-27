# Verification — 2026-10-27

Scope: the 1.1.0 working tree based on commit `453f3fb19b796421f82104444c5f06c328b8ccad`. This is a local implementation report, not a published GitHub release receipt.

## Local checks

- `npm test`: **24 tests passed**, zero failures or skipped tests, using the existing Node **22.23.2** installation. No package installation or hosted CI run.
- Coverage includes PKCE/state, loopback callback binding, duplicate callbacks, host/path/method rejection, denial/error handling, callback expiry, full synthetic OAuth flow, secure token replacement, JSON/SSE parsing, CR/LF/CRLF and UTF-8 chunk boundaries, open streams, request IDs, initialization/session headers, tools pagination, refresh rotation/coalescing, disabled retry propagation, failures/timeouts and default mutation guards.
- A real loopback HTTP server verifies initialization → refresh → catalog → account reads with mixed JSON and SSE. All its credentials and account data are synthetic.
- An auth CLI subprocess test verifies a nonzero exit on discovery failure without opening a browser or writing a token.
- Static validation passed for all 13 JavaScript modules, 30 relative Markdown links, the JSON/TOML configuration examples and Git diff whitespace.
- Independent review found two issues (CR-only SSE at EOF and disabled refresh not reaching initialization); both were corrected and covered by regression tests. Follow-up review found no additional material auth/correctness issue.
- Codex `mcp add --help` and `mcp login --help` confirmed documented syntax. A read-only `codex mcp get` with temporary `-c` overrides accepted the example's streamable HTTP URL and three-tool allowlist. No Codex configuration was installed or changed.

The shell's default Node resolution once reached an unrelated broken Homebrew dynamic-library dependency. Validation used the already-installed `/opt/homebrew/opt/node@22/bin/node`; no runtime was upgraded or repaired. Node 18.20 and Windows were not exercised.

## Live Contra checks

The owner explicitly authorized a new SDK OAuth login and subsequent read-only checks. A previous saved session returned 401 and its refresh returned 400; that failure was not reported as a pass and was not repeatedly retried.

The updated SDK then completed:

- OAuth discovery, dynamic client registration, PKCE browser callback, token exchange and `whoami` verification.
- A separate real refresh-token exchange followed by identity verification for the intended account.
- MCP initialization with negotiated protocol **2025-03-26**, initialized notification and `tools/list` discovery.
- `npm run health`'s equivalent script: **123 tools**, identity verified, **3 services** and **5 published projects** returned (portfolio request limit 10).
- The `whoami`, `services` and `projects` npm commands exited successfully with populated output. Private response bodies and tokens are not included here.

The tool count is an account-specific observation, not a fixed API guarantee. The live schemas still expose profile, productized-service and portfolio prepare/confirm tools. Schema discovery does not prove that a mutation succeeds.

**No Contra content mutation, prepare, confirm, publication, message, invoice or payment was performed.** OAuth registration/consent and token renewal were the authorized account-access changes. The new SDK credential file is ignored by Git; it is not part of the deliverable.

## Limits

- No live write was tested, in accordance with the owner's hold. No server draft was created.
- Native Codex, Claude, Cursor, Windsurf and Antigravity sign-ins were not executed. Their documentation/configuration was checked separately from the working SDK login.
- This does not certify all 123 tools, media uploads, every account role or every supported protocol version.
- No cross-process refresh lock exists. Use one process per SDK token file.
- No GitHub push, Actions dispatch or release was performed during these checks.

## Sources

- [Contra MCP capabilities and installation](https://contra.com/features/mcp)
- [Contra OAuth metadata](https://contra.com/.well-known/oauth-authorization-server)
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)
- [Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Cursor MCP](https://cursor.com/docs/mcp)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
