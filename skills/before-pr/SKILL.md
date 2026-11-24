---
name: instinct-before-pr
description: Prepare work for a pull/merge request. Use on your own, without being asked, when a change is ready to hand to the user for review — finished a task, about to commit for a PR, or the user says "open a PR", "ready for review", "ส่งรีวิว", "เปิด PR/MR". Assigns a risk tier, runs the AI reviews that tier requires, gathers evidence and writes the PR description. Never opens the PR itself without asking.
---

# before-pr

The user is the final reviewer. Your job is to make their review fast: small single-topic
change, a risk tier, evidence instead of reading, and AI review already done.

CLI: `node <instinct>/bin/instinct.js`, where `<instinct>` is the repo that holds this skill
(this file is `<instinct>/skills/before-pr/SKILL.md`; resolve the symlink).
Run it from the project directory.

## Steps

1. **Scope check.** `git status` and `git diff --stat`. If the change mixes topics, propose
   splitting it before going on. The criteria are the ticket in `.scratch/<feature>/issues/`;
   link it with `--source`. This skill alone sets its `**Status:**` to `done`: after the PR is
   merged, or, when there is no PR (local work), after the user accepts the change.
   If there are no confirmed acceptance criteria for this work,
   stop and get them from the user first (requirement gate).

2. **Config.** `instinct config`. If it prints a draft, show it to the user and save it with
   `instinct config --write` only after they confirm. Respect `pr_access`:
   `manual` means you only produce the text; the user opens the PR.

3. **Risk tier.** `instinct risk` (uncommitted work) or `instinct risk --base <branch>`
   (a whole branch). You may raise the tier if you know something the paths don't show
   (e.g. a pricing rule in a file named `utils.ts`). Never lower it without telling the user why.

4. **AI review by tier** — reversible, so do it without asking:
   - 🟢 green: review the diff yourself.
   - 🟡 yellow: `surgeon-reviewer` (or roles/surgeon-reviewer.md via `instinct dispatch` on any vendor) on the diff.
   - Model for any reviewer above: per the table in `instinct-autopilot` "Model level" (🟢 the lead reviews).
   - 🔴 red: `surgeon-reviewer` (or roles/surgeon-reviewer.md via `instinct dispatch` on any vendor) **and** an agent from another vendor that is `on` in the "instinct: agents" block (`instinct route` names it;
     launch how-to in `<instinct>/docs/agents.md`). None on → a Claude subagent, and tell the user. Give both the same narrow, read-only scope.
   Fix real findings locally (do not commit yet; that waits for step 7), re-run tests,
   and re-review if the fix was non-trivial.
   Keep every finding and what you did with it for the PR body.
   The review must cover every changed code file, scripts and setup files included; list
   each file with who reviewed it. A file left out is a gap to report, not a pass.

5. **Evidence.** Run the tests and record the command and pass/fail/skip counts. For a bug
   fix, show the test failing before the fix and passing after. Screenshots or logs for UI
   or runtime behaviour. No evidence → say so under "Open doubts"; never imply it.

6. **PR body.** `instinct pr-body [--base <branch>] [--source <requirement link>]` prints the
   template with the tier and files filled in. Fill every remaining section:
   acceptance-criteria checklist (ticked only if evidence shows it), evidence,
   `file:line` places worth reading, the AI review table, open doubts.
   Delete placeholder text in italics.

7. **Hand over — ask first** (under `instinct-autopilot` the owner already said yes for `feat/*`). Committing, pushing and opening the PR are outward actions:
   ask before each. With `pr_access: manual`, give the user the title and body ready to paste.

8. **Log.** After the user has reviewed (same session or later), record it:
   `instinct pr-log --tier <tier> --title "<title>" --rework <rounds> [--review-minutes N] [--missed "issue a|issue b"] [--url <pr>]`.
   For every issue the user caught that AI review missed, also record a lesson
   (`instinct record --tier project ...`) so the next review catches it.

## Rules

- Do not paste the whole diff into the PR; point at the few places that matter.
- QA test plan and release notes only on release PRs.
- Report honestly: a skipped step is written down, not hidden.
