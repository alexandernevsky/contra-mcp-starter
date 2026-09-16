#!/usr/bin/env node
import { whoami, listPortfolioProjects } from "../contra-client.mjs";

try {
  const me = await whoami();
  const username = me?.visitor?.userAccount?.profile?.displayUsername;

  if (!username) {
    throw new Error("Could not detect authenticated username from Contra token.");
  }

  console.log(`\n💼 Fetching portfolio projects for @${username}...\n`);
  const data = await listPortfolioProjects(username, { includeDrafts: true, limit: 25 });
  const projects = data.projects || [];
  const workPosts = data.workPosts || [];

  console.log(`Found ${projects.length} Case Study Project(s) and ${workPosts.length} Work Post(s):\n`);

  if (projects.length > 0) {
    console.log("=== Case Studies (Full Projects) ===");
    projects.forEach((p, idx) => {
      console.log(`${idx + 1}. [${p.isDraft ? "DRAFT" : "LIVE"}] ${p.title}`);
      console.log(`   Slug:      ${p.slug}`);
      console.log(`   Published: ${p.publishedAt || "Not published"}`);
      console.log(`   Tools:     ${p.tools?.map((t) => (typeof t === "string" ? t : t.name)).join(", ") || "None"}\n`);
    });
  }

  if (workPosts.length > 0) {
    console.log("=== Work Posts (Community Feed) ===");
    workPosts.forEach((w, idx) => {
      console.log(`${idx + 1}. ${w.title}`);
      console.log(`   Slug: ${w.slug}`);
      console.log(`   URL:  ${w.socialPost?.url || "N/A"}\n`);
    });
  }
} catch (err) {
  console.error("❌ Failed to inspect portfolio projects:", err.message);
  process.exit(1);
}
