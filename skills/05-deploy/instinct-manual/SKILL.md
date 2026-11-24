---
name: instinct-manual
description: Create and review screenshot-backed user manuals (user-manual-for-<slug>.md) with iterative discovery, gap reporting, step-by-step guides, and troubleshooting.
disable-model-invocation: true
---

# Instinct Manual

Create clear, verified user manuals tailored to a defined target reader.

## Workflow

1. **Ground & Interview:** Inspect the repo (routes, UI components, docs, error messages) first. Ask concise rounds of questions until you have enough context to write:
   - Product/feature scope and core user flows to cover.
   - **Target reader persona:** role, technical level, and preferred language/tone.
   - Prerequisites/access (accounts, permissions, devices) and common failure scenarios.
   - Do not start drafting while critical information is missing.
2. **Gap & Blocker Report:** Explicitly list anything missing, unverified, or waiting on the user/environment (e.g., test credentials, staging URL, unrunnable app, unresolved edge cases). Never guess or invent UI or steps.
3. **Capture & Draft:** Save the manual to `docs/manuals/user-manual-for-<slug>.md` (unless the repo uses another convention) and screenshots to `docs/manuals/assets/<slug>/` linked via relative paths (`assets/<slug>/...`). Capture real UI via Playwright/ADB MCP or available tools; if blocked, insert `[TODO: screenshot - <screen/state>]` and list it in the gap report.
   - **Overview & Target Audience:** Who this manual is for and what they can accomplish.
   - **Prerequisites & Access:** Required accounts, roles, devices, or setup.
   - **Step-by-Step Walkthrough:** Ordered tasks with screenshots and expected results.
   - **Troubleshooting:** Table of `Issue | How to Check | How to Fix | Escalation / Support`.
4. **Target-Persona Review:** Review the completed manual from the defined target reader's perspective and report a readiness verdict (`READY` or `NEEDS INPUT`):
   - Is the language and jargon appropriate for this persona?
   - Can they complete every flow without tribal knowledge?
   - Are all screenshots accurate, legible, and free of placeholders?
   - Do troubleshooting entries cover realistic failures with actionable checks and fixes?

## Rules

- Redact all PII, credentials, tokens, and internal-only URLs from screenshots and examples.
- Never document unverified UI elements, labels, or steps as fact.
