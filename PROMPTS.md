# 🤖 Ready-to-Use AI Agent Prompts (Copy & Paste)

You don't need to write JavaScript or run manual scripts. If you open this repository in **Cursor**, **Google Antigravity**, **Claude Code**, or **Windsurf**, you can simply copy and paste any of these prompts into the AI chat.

Your AI assistant will read [`AGENTS.md`](AGENTS.md), connect to Contra via MCP, and handle the entire workflow autonomously while showing you previews before confirming any changes.

---

## 🚀 1. The "Do Everything" Profile Setup

> **Prompt:**
> ```text
> Connect to my Contra account via MCP. Check my current profile and services. Then:
> 1. Read templates/profile.example.md and help me adapt it into a sharp, high-converting bio and headline.
> 2. Read templates/services.example.md and structure 3 flagship services with monthly retainer rates, concrete deliverables, and targeted FAQs.
> 3. Prepare all updates using the xxx_prepare tools and show me the full before/after diff for my approval before making any live changes.
> ```

---

## 📦 2. Publish a New Portfolio Case Study

> **Prompt:**
> ```text
> I want to publish a new case study on my Contra portfolio.
> Here are my project notes / live site link: [PASTE YOUR NOTES OR URL HERE].
> 
> Please:
> 1. Structure this project using the format in templates/case-study.example.md (Overview, The Problem, The Solution, Engineering Highlights, Tech Stack).
> 2. Pick 1–3 relevant roles and up to 5 tools.
> 3. Call create_portfolio_project_prepare to create a draft and show me the exact preview summary before publishing.
> ```

---

## 💎 3. Audit & Upgrade Existing Services (High-Ticket Positioning)

> **Prompt:**
> ```text
> Call list_services to fetch my current services on Contra.
> Audit my pricing, titles, deliverables, and FAQs against top-earning independent product builders.
> Suggest improvements to move away from cheap commodity gigs toward monthly retainers ($4,000–$7,000/mo) and sprint packages.
> Once we agree, prepare the updates via update_productized_service_prepare.
> ```

---

## 🔄 4. Synchronize Markdown Files with Contra (Content-as-Code)

> **Prompt:**
> ```text
> I've edited my local markdown files in templates/ (or portfolio/).
> Compare my local files against my live Contra profile and services.
> Show me the differences and prepare the necessary updates to sync my live Contra profile with my local Git repository.
> ```

---

## 🔍 5. Pre-Flight Health Check

> **Prompt:**
> ```text
> Run a pre-flight check on my Contra MCP setup:
> 1. Verify whoami and token expiration status.
> 2. List all my published services and portfolio projects.
> 3. Check if any draft projects are pending and report back with a clean summary table.
> ```
