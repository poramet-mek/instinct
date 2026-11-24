---
name: instinct-on-ask
description: Answer a plain question about the project, or say which instinct skill fits the situation, without changing anything. Use on your own when the user only asks, wants an opinion or explanation, or asks what to do next or which skill to use — "ถามหน่อย", "ทำไม", "อันนี้ทำงานยังไง", "ควร...ไหม" (about an idea, not a ready request), "ตอนนี้ควรทำอะไรต่อ", "ใช้ skill ไหน", "how does X work?", "what next?". Not for work: a message that asks for a change (ให้หน่อย, ช่วยทำ, แก้, เพิ่ม, ทำเลย) is work even when phrased as a question — use instinct-on-requirement. Not for failing, broken or slow behavior ("ทำไม test fail") — use instinct-on-bug. Not for structuring planned work — use instinct-on-design.
---

# On ask

The user is asking, not ordering work. Answer; do not start work.

## Steps

1. **Classify.** A question about the project or an opinion → answer it (step 2). "What next?" or "which skill?" → route (step 3). If the message asks for a change, even politely ("…ให้หน่อย โอเคไหม"), it is work: stop and use `instinct-on-requirement`. If it asks why something fails, breaks or is slow, use `instinct-on-bug`.
   A mixed message ("run the API for me, and what should the DB contain?") is split: answer the question part here, and for the work part draft one-line criteria via `instinct-on-requirement` and wait. Do not do the work part under this skill.
2. **Answer from sources.** Read the code, docs, lessons and git history yourself; cite `path:line`. For "what is left / what next", the work list is `.scratch/<feature>/spec.md` and `.scratch/<feature>/issues/*.md`: read every ticket's `**Status:**` (the session-start "instinct: open work" block lists the ones not done) and report by status — ready-for-agent, in-progress, needs-triage, blocked by — before grepping code. Say which tickets you only saw by status and did not verify in code. Give a recommendation when asked for an opinion, not a survey. Say what you could not verify.
3. **Route.** Name the one skill that fits now and why, in a line or two, using the map below. Do not run it; the user (or their next request) starts it.

## Map

Main flow: `instinct-on-requirement` (criteria, confirmed) → `instinct-on-design` (non-trivial or unclear structure) → `instinct-on-build` (TDD, evidence) → `instinct-before-pr` (risk tier, AI review, PR text) → `instinct-on-release`.

On-ramps and side paths:
- Something broken, failing or slow → `instinct-on-bug`.
- Codebase hard to change, tech debt, "where should we refactor?" → `instinct-on-upkeep`.
- Work splits into independent parts, a 🔴 change needs a cross-vendor review, or a second opinion → `instinct-on-delegate`.
- Switching agent, directory, or handing to a colleague → `instinct-handoff`; staying put → compact.
- The user corrected you or you caught your own mistake → `instinct-after-mistake`.
- The user confirmed something non-obvious worked, or a big piece of work ended → `instinct-on-success`.

## Rules

- Read-only for project files: no edits, commits, pushes, installs or messages to others. Also no builds, starting or stopping services, or writes to databases: those are work. Exception: recording a lesson via `instinct-after-mistake` or `instinct-on-success` is allowed.
- No acceptance criteria or requirement gate for a plain question.
- If the answer leads to work, end by naming the skill that would start it and wait for the user.
