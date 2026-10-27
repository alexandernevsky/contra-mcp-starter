#!/usr/bin/env node
import { whoami } from "../contra-client.mjs";

try {
  const me = await whoami();
  const profile = me?.visitor?.userAccount?.profile;
  if (!profile?.displayUsername) throw new Error("whoami did not identify the account.");

  console.log("\n👤 Contra Authenticated Profile\n");
  console.log(`Username: @${profile?.displayUsername || "unknown"}`);
  console.log(`Name:     ${profile?.firstName || ""} ${profile?.lastName || ""}`);
  console.log(`Type:     ${me?.visitor?.selectedUserType || "N/A"}`);
  console.log(`Profile:  https://contra.com/${profile?.displayUsername}\n`);
} catch (err) {
  console.error("❌ Failed to query profile:", err.message);
  process.exit(1);
}
