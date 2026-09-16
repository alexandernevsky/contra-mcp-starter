#!/usr/bin/env node
/**
 * Safe Prepare & Confirm Demonstration
 *
 * Demonstrates how Contra MCP uses a two-phase commit protocol:
 * 1. callContraTool("update_productized_service_prepare", args) -> returns draft preview
 * 2. review preview changes with user
 * 3. callContraTool("update_productized_service_confirm", { draftId, confirm: true })
 */

import { callContraTool, whoami, listServices } from "../contra-client.mjs";

try {
  const me = await whoami();
  const username = me?.visitor?.userAccount?.profile?.displayUsername;
  const list = await listServices(username);
  const firstService = list.services?.[0];

  if (!firstService) {
    console.log("No existing service to test with. Create one first!");
    process.exit(0);
  }

  console.log(`\n🔍 Preparing dry-run draft for: "${firstService.title}" (${firstService.slug})...\n`);

  // Phase 1: Prepare draft (dry-run, no database mutations)
  const draft = await callContraTool("update_productized_service_prepare", {
    slug: firstService.slug,
    // Omitting other fields preserves them exactly as they are!
  });

  console.log("✓ Draft created successfully!");
  console.log(`Draft ID:   ${draft.draftId}`);
  console.log(`Expires in: ${draft.expiresInSeconds} seconds`);
  console.log(`Requires confirmation: ${draft.confirmationRequired}`);

  if (draft.preview?.changes?.length > 0) {
    console.log("\nChanges detected:");
    draft.preview.changes.forEach((c) => {
      console.log(`- ${c.label}: "${c.from}" -> "${c.to}"`);
    });
  } else {
    console.log("\n(No field changes provided; draft verified service schema cleanly)");
  }

  console.log("\n🛡️ Safety reminder: Never call 'confirm' without human review of the draft preview!\n");
} catch (err) {
  console.error("❌ Prepare failed:", err.message);
  process.exit(1);
}
