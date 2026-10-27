#!/usr/bin/env node
import { listTools } from '../contra-client.mjs';
try {
  const tools = await listTools();
  // Schemas describe the API; no account content or tokens are printed.
  console.log(JSON.stringify({ count: tools.length, tools }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
