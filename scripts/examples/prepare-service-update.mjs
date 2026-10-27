#!/usr/bin/env node
// This example deliberately needs a chosen target and an explicit prepare flag.
// It creates a server-side draft; it is NOT an offline test or read-only health check.
import { callContraTool } from "../contra-client.mjs";
const [flag, slug] = process.argv.slice(2);
if (flag !== '--prepare' || !slug) {
  console.error('Usage: node scripts/examples/prepare-service-update.mjs --prepare SERVICE_SLUG');
  console.error('Review the live tool schema first. This creates a Contra draft; it never confirms it.');
  process.exitCode = 1;
} else {
  try {
    const draft = await callContraTool('update_productized_service_prepare', { slug }, { allowMutation: true });
    console.log(JSON.stringify(draft, null, 2));
    console.log('Review every changed field with the owner before any separate confirm call.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
