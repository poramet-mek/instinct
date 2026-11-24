---
name: instinct-on-build
description: Implement confirmed acceptance criteria with test-driven development and attach evidence. Use on your own when design is settled and code needs building, including "implement this", "build the feature", "write tests first", "ช่วยลงมือทำ", "เขียน test".
---

# On build

Use confirmed criteria as the source of truth. Read relevant context and ADRs, then work in small vertical slices.

## Steps

1. **Gate.** Find the confirmed ticket in `.scratch/<feature>/issues/` (see `instinct-on-requirement`) and set its `**Status:**` to `in-progress`. Its `**Blocked by:**` tickets must be `in-review` (built and committed) or `done` first. No file or no confirmation → go back to `instinct-on-requirement`; a follow-up request in chat ("add it for me", "pack it") is new work and needs its own criteria too. If design was skipped for non-trivial work, say in one line why (e.g. "ADRs 0017–0021 already fix the structure").
2. **Pre-flight risk.** List actions this slice will take that are risky as defined in the session-start "instinct: work rules" block. Each needs the user's explicit yes before you run it, even if the criteria were confirmed.
3. For each behavior, write one focused test at the appropriate public seam and run it to observe failure.
4. Add the smallest implementation that makes that test pass. Run it again, then refactor only when behavior is covered; repeat slice by slice.
5. Run relevant focused tests, then the broader available checks. Capture commands and actual pass/fail/skip output.
6. **Clean up test data.** Records, files or processes you created only to verify (e.g. `VERIFY-*` rows) are removed, or listed for the user with the command to remove them. Never let them ship inside a package or dump.
7. **Review coverage.** Reviewer model by risk tier per the table in `instinct-autopilot` "Model level" (std level for 🟢/🟡, high for 🔴; `instinct dispatch --level`). List every new or changed code file (scripts included) with its review status: reviewed by whom, or skipped and why. Lockfile-only or docs-only changes may skip, stated. Follow the review rule in `~/.agents/AGENTS.md`; red-tier work also needs a different vendor's review.
8. **Hand-off.** Map each criterion to its test or other direct evidence, with file locations, and tick its checkbox in the ticket only when the evidence shows it. Set `**Status:**` to `in-review`, or `in-progress (<what is waiting>)` when something such as a device test or a real-database run is still open. Only `instinct-before-pr` sets `done`. Then:
   - **Failed or blocked commands:** every one, with the reason and what you did instead.
   - **Follow-ups:** anything left half-done (an out-of-sync lockfile, a step only the user can run, an untested path) is appended to the `## Follow-ups` section of the ticket (add the section if it is missing), not only written in chat.
   - **Against the original request:** if the confirmed slice is narrower than what the user first asked, say what is still missing to reach it.

## Rules

- TDD: red, minimal green, then refactor. Tests describe behavior, not private implementation details.
- Don't claim a criterion is met without evidence. Report skipped or unavailable checks plainly.
- Keep implementation within the agreed scope; surface design changes and get confirmation before expanding requirements.
- Each delegated task is one confirmed slice, not the whole feature; read the helper's real test output before reporting.
- Several tickets given at once: use the round, worktree, vendor and model rules of `instinct-autopilot` "Parallel rounds" (max 3 at once). Outside autopilot, commits, merges and branch/worktree deletion still need the owner's yes: ask once for the whole round before starting. Keep the same per-ticket state in `.scratch/<feature>/autopilot.md`, and use this skill's own steps for testing, review and fixes.
- **Builder and reviewer come from different vendors.** Before building, rate the ticket: size S (one file or wording) / M (one feature) / L (several modules), whether it needs design, and its risk tier; then run `instinct route --type build --size <S|M|L> [--design] [--red]`. It names the builder from the task-fit table (per-size scores take over at 3) and prints why; record the why in the state file. Without `--size` it rotates gemini → codex → agy → claude and the cross-vendor reviewer. Dispatch as in `instinct-on-delegate` step 4 (`hc run` inside Herdr, `codex exec` outside). If the builder fails, fall back automatically as in `instinct-on-delegate` step 4 (`route --skip` picks the next builder) and say in one line which vendor failed and why. The `route` reviewer is the step 7 review: when it is `surgeon-reviewer` (or roles/surgeon-reviewer.md via `instinct dispatch` on any vendor) do not run it twice; when it is `codex` it replaces nothing and `surgeon-reviewer` still runs.
- After the slice, score the builder with `instinct score add --type build --size <S|M|L> ...` (see `instinct-on-delegate` step 6), also when the builder was a claude helper or you yourself (`--agent claude`). Use `--size` on `score add` whenever routing used `--size`: a score without it never counts for task fit. Without scores neither the rotation nor the fit table learns.
- Reversible code and tests are authorized. Ask before commit, push, deletion, or outward-facing messages, except under `instinct-autopilot`, which carries the owner's yes for commit and push on `feat/*`.
