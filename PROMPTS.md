# Prompts for Codex and other MCP clients

Connect using [README.md](README.md) first. These prompts require working OAuth; opening the folder alone does not connect an account. Read [AGENTS.md](AGENTS.md). Templates contain examples to adapt, not approved claims or prices.

## Inspect the account (read-only)

> Discover the current Contra tools and schemas, verify my account with whoami, and list my services and published portfolio. Report response limits and missing access. Do not create drafts, call prepare/confirm, send messages or perform financial operations.

## Draft profile and service improvements locally

> Inspect my existing Contra profile and services. Use templates/profile.example.md and templates/services.example.md as structure. Propose copy based only on my supplied experience, prices and deliverables. Keep all proposed changes local and show a complete before/after diff. Do not call prepare or confirm yet.

## Prepare an approved service change

> Read AGENTS.md and the current service-update schema. For this exact service [SLUG], prepare only these approved edits: [EDITS]. Preserve unrelated fields and complete arrays. Show the returned draft ID, expiry and every changed field. Stop before confirm and wait for my explicit approval of that preview.

## Prepare a portfolio case study

> Use these project notes and approved public media: [NOTES / LINKS]. Structure a case study using templates/case-study.example.md without inventing outcomes. After we agree on the content, use the current portfolio prepare tool and show its full preview and publication state. Wait for approval before confirming anything.

## Compare local content with Contra

> Compare my local Markdown material with my current Contra profile, services and portfolio. Show differences, stable target IDs and any fields that would be fully replaced. Keep this read-only: do not sync, create drafts or publish.

## Check the toolkit

> Run npm test offline. If an existing SDK session is available and live reading is authorized, run npm run health separately. Do not run auth automatically, create drafts or confirm changes. Report offline results and live access separately; never print credentials or private account exports.
