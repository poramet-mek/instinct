---
name: instinct-after-mistake
description: Record a lesson after a mistake so it is not repeated. Use on your own, without being asked, right after the user corrects you ("ไม่ใช่", "ผิด", "บอกแล้วว่า", "no, I said"), when you catch your own mistake (tests fail after you said done, you retract an answer, a reviewer finds what you missed), or when the user catches in review something AI review missed.
---

# after-mistake

A mistake is only expensive the second time. Turn each one into a lesson that the hooks
will inject the next time the same moment comes up.

CLI: `node <instinct>/bin/instinct.js`, where `<instinct>` is the repo that holds this skill
(resolve the symlink). Run it from the project directory.

## Steps

1. **Fix first.** Correct the work and confirm the fix (test, rerun, re-read). Say plainly what
   was wrong; no excuses, no long apology.

2. **Find the rule.** Ask: what should I have done, and at which moment would a reminder have
   stopped me? One mistake → one rule. Skip it if it was a one-off typo with no pattern.

3. **Pick the tier.**
   - `project`: true only for this codebase (its conventions, its tools, its people).
   - `general`: true in any project. When unsure, use `project`; promotion to general
     happens on its own once the same lesson id is recorded in 2+ projects.

4. **Look for an existing lesson.** Read the tier's `INDEX.md`. If a lesson already covers it,
   record again with the **same id** (this bumps `seen`; ids must match across projects for
   promotion to work). Otherwise pick a short kebab-case id that names the rule, not the incident.

5. **Record it** (reversible, so do not ask):
   ```
   instinct record --tier project|general --id <kebab-id> --type avoid|do \
     --rule "<one sentence>" --why "<what went wrong / why it matters>" \
     --how "<what to do at that moment>" --tags a,b \
     --trigger '[{"event":"pre-tool","command":"git commit*"}]'
   ```
   Triggers say *when* to remind: `prompt` with words, `pre-tool` with a command glob,
   `post-edit` with a path glob. Prefer a narrow trigger; a lesson injected everywhere is noise.

6. **Tell the user** in one line: the lesson id, tier, and when it will fire. If it was promoted
   to general, say so and give the undo: `instinct promote --revert <id>`.

## Rules

- Write the rule as an instruction to your future self, not a story of what happened.
- No secrets, names or customer data in a lesson.
- Never record a lesson that contradicts what the user said; ask instead.
