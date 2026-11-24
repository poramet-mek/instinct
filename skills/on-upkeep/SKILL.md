---
name: instinct-on-upkeep
description: Survey the codebase for structural friction and propose ranked refactor candidates, without changing code. Use on your own when the user talks about tech debt, cleaning up or restructuring the codebase, code that is hard to change or test, or asks where the architecture should improve — "ปรับโครงสร้าง", "หนี้เทคนิค", "โค้ดรก", "refactor ตรงไหนดี", "improve the architecture". Not for one known bug (instinct-on-bug), a confirmed feature (instinct-on-design), or a specific refactor the user already chose (instinct-on-requirement).
---

# On upkeep

Find where the codebase fights the people and agents changing it, and propose fixes. This is a
survey: it produces candidates, not code.

`<instinct>` is the repo that holds this skill (this file is
`<instinct>/skills/on-upkeep/SKILL.md`; resolve the symlink). If that folder is not found (e.g. a copied install), use the template path given in the session-start "instinct: documents" block.

## Steps

1. **Scope first.** If the user named an area, use it. Otherwise read `git log --oneline` far
   enough back to find hot spots (files that keep changing) and look there first.
2. **Read the single source.** `CONTEXT.md` for domain terms, ADRs (usually `docs/adr/`) for
   decisions not to re-litigate. If a candidate contradicts an ADR, raise it only when the friction
   is real, and say which ADR and why it is worth reopening.
3. **Look for friction.** Concepts spread across many small modules; shallow modules whose
   interface is as complex as their body; code that is hard to test through its interface; modules
   that leak into each other. Test a suspect by asking: would deleting it concentrate complexity or
   just move it?
4. **Present candidates**, best first, each with: files, problem, proposed change in plain words,
   benefit (what gets easier to change or test), and strength — Strong / Worth exploring /
   Speculative. End with the one you would do first and why.
5. **Hand off.** Ask which candidate to pursue. The chosen one goes to `instinct-on-requirement`
   (criteria) and then `instinct-on-design`. If the user rejects one for a lasting reason, offer to
   record it as an ADR using `<instinct>/templates/adr.md` so later surveys do not suggest it again.

## Rules

- Read-only: no code edits, commits or branches during the survey.
- Use the domain words in `CONTEXT.md`; if a needed term is missing, propose adding it and ask.
- Do not propose detailed interfaces yet; that belongs to `instinct-on-design`.
- Weigh recently changed code most: improving code nobody touches buys little.
