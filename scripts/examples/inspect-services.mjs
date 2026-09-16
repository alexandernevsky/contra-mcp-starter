#!/usr/bin/env node
import { whoami, listServices } from "../contra-client.mjs";

try {
  const me = await whoami();
  const username = me?.visitor?.userAccount?.profile?.displayUsername;

  if (!username) {
    throw new Error("Could not detect authenticated username from Contra token.");
  }

  console.log(`\n📦 Fetching offered services for @${username}...\n`);
  const data = await listServices(username);
  const services = data.services || [];

  if (services.length === 0) {
    console.log("No services found on your profile yet. Create one via create_productized_service_prepare!");
  } else {
    console.log(`Found ${services.length} active service(s):\n`);
    services.forEach((s, idx) => {
      const priceStr = s.price?.amount
        ? `$${s.price.amount}${s.price.interval ? ` / ${s.price.interval.toLowerCase()}` : ""}`
        : "Contact for pricing";
      const durationStr = s.duration
        ? `${s.duration.amount} ${s.duration.interval?.toLowerCase()}(s)`
        : "Flexible";

      console.log(`${idx + 1}. ${s.title}`);
      console.log(`   Price:    ${priceStr}`);
      console.log(`   Timeline: ${durationStr}`);
      console.log(`   URL:      ${s.serviceUrl}`);
      console.log(`   Slug:     ${s.slug}\n`);
    });
  }
} catch (err) {
  console.error("❌ Failed to inspect services:", err.message);
  process.exit(1);
}
