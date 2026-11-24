---
name: instinct-on-requirement
description: Turn any request, tracker item, document or conversation into testable acceptance criteria and get the user's confirmation before code. Use on your own when work is requested or its outcome is unclear, including "define the requirement", "what are the acceptance criteria?", "ช่วยเขียน requirement", "ตั้งเงื่อนไขยอมรับ". A request to make a change is work even when phrased as a question ("…ให้หน่อย โอเคไหม"). Only pure questions or opinions with no change asked go to instinct-on-ask.
---

# On requirement

Establish the requirement gate before any code. Requirements can come from a prompt, chat, tracker, or document. Preserve a link to the source; for chat, cite the conversation or message context available.

## Steps

1. Find and read the source. Inspect relevant project context and existing behavior yourself; don't ask the user for facts available in the repo or linked material.
2. Classify scope. For small, bounded work, draft 2–3 criteria. For large, ambiguous, or cross-cutting work, grill the user in rounds (plain-text questions are fine; see `<instinct>/docs/agents.md` (`<instinct>` is the repo holding this skill; resolve the symlink)) until decisions and meaningful edge cases are resolved.
3. Write criteria as observable outcomes with clear pass/fail evidence. Include important constraints and failure cases; avoid prescribing implementation unless required.
4. **Slice.** If there are more than 5 criteria, or the work spans several modules or tables, split it into tracer-bullet slices: the first slice is thin but end to end (e.g. one topic on both backends with its transaction), later slices widen it. Each slice gets its own criteria and is confirmed, built and reviewed on its own; never delegate the whole set as one task.
5. **Save.** Once confirmed, every set of criteria lives in a file, so it survives a context reset, compaction and hand-offs. Use the layout shared with the mattpocock skills:
   - The feature's spec is `.scratch/<feature>/spec.md` (template: `<instinct>/templates/spec.md`; `<instinct>` is the repo that holds this skill, resolve the symlink; if not found, use the template path in the session-start "instinct: documents" block). Read an existing one before writing; never replace it.
   - Each confirmed slice is a ticket `.scratch/<feature>/issues/NN-<slug>.md`, numbered after the last existing ticket, in the same shape as the existing ones: `# NN: <title>`, `**What to build:**`, `**Blocked by:**`, `**Status:** ready-for-agent`, the criteria as `- [ ]` checkboxes, the source, and a `## Follow-ups` section.
   - Ask which version the ticket ships in (in the same confirmation round) and add `**Release:** <version>`. Add the ticket to `.scratch/releases/<version>.md` (create it with a `# <version>` heading and a ticket list if missing).
   - Small work with no feature folder yet: create `.scratch/<feature>/issues/01-<slug>.md` alone; a spec is not needed.
   - Only if the project clearly keeps specs elsewhere, use that place and say so.
6. After any grilling, present the source link, the criteria, any risky actions they imply (as listed in the session-start "instinct: work rules" block) and all remaining open decisions **in one confirmation round**; do not follow it with a second round of questions you could have asked in it. Ask them to confirm or correct.
7. After explicit confirmation, write the file (step 5), then begin implementation. If the criteria change, restate them, confirm the changed scope and update the file.

## Rules

- No code before confirmed, testable acceptance criteria.
- Keep source links with the criteria so later design, tests, and review can trace intent.
- Do reversible investigation and drafting without asking. Ask before commit, push, deletion, or outward-facing messages.
- If a spec or set of criteria lacks a section the spec template requires (goals/non-goals, failure and edge cases, open questions), name the gap, propose content in the template's format and ask. Never fill it silently or skip it.
- A confirmed spec file is the source for design, build and review; update it, and re-confirm, when scope changes.
- If source material is inaccessible, state that and work from the request while identifying the assumption for confirmation.
