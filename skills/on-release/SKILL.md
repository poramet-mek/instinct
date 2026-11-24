---
name: instinct-on-release
description: Prepare a release. Use on your own, without being asked, when work is being prepared for a release or a release PR, or the user says "ออก release", "release notes", "เตรียม release", "QA test plan", "ปล่อยเวอร์ชัน". Lists what merged since the last tag, writes stakeholder release notes and a QA test plan from the acceptance criteria, and checks ADR/CONTEXT.md. Never tags, pushes or publishes without asking.
---

# on-release

Docs are a by-product of the work. This skill generates the per-audience docs for a release
from one source: the acceptance criteria and ADRs already recorded for each merged change.
It writes no new requirements.

CLI: `node <instinct>/bin/instinct.js`, where `<instinct>` is the repo that holds this skill
(resolve the symlink). Run it from the project directory.

## Steps

1. **Find the range.** The last **release** tag, skipping rc tags:
   `git describe --tags --abbrev=0 --exclude "*-rc.*"`. If there is none,
   ask the user for the starting point. List merged work with
   `git log <last-tag>..HEAD --merges --oneline` (or `--first-parent` if the project uses
   squash merges). Also read `.instinct/pr-log.jsonl` if it exists; it holds the PR title,
   tier and URL.

2. **Link each item.** For every merged change, find its PR URL and its acceptance criteria
   (from the PR body, the tracker or the requirement source). An item with no linked criteria
   is listed under "Unverified" and is not described as a feature. Ask the user before dropping it.

3. **Check the single source.** Confirm `ADR/` and `CONTEXT.md` reflect the decisions behind
   these changes. If one is stale, update it in the same release PR and say so.

4. **Release notes (stakeholders).** Write plain-language notes: what changed for users, what
   is fixed, what breaks or needs action, and the known limits. No file names, no internal
   jargon, no ticket-only wording. Each bullet ends with its PR link.

5. **QA test plan (QA).** For each acceptance criterion, write one test case: precondition,
   steps, expected result, and the PR it came from. Add a short regression list for the
   areas touched by 🔴 or 🟡 changes. Mark any criterion with no automated evidence as "manual".

6. **Release PR.** One PR from `release/<version>` into `main` (opened in step 7.2). Its body
   holds the notes, the test plan, the release's risk tier (highest of its items) and the
   release checklist line for the version code. Use `instinct pr-body` for the template.

7. **Release flow** (owner, 2026-11-23/24). Tags, pushes and merges each need the owner's yes:
   1. Check `.scratch/releases/<version>.md`: every ticket listed is `done` or `in-review` and has
      `**Release:** <version>`. Missing → say which and ask.
   2. **Ask**, then cut `release/<version>` from `main` once its features are in (bug fixes only
      from then on). Pushing the branch and opening the release PR each need a yes.
   3. Next tag: `rc.N` with N = highest existing `v<version>-rc.*` tag + 1 (first is `rc.1`;
      numbers are never reused). **Ask** before tagging; only after the yes:
      - `CHANGELOG.md` at the repo root: one `## <version>` section, written from the commits
        since the last release tag (step 1): `feat` → Added, `fix` → Fixed, `remove` → Removed,
        other types skipped. Each rc replaces this section (the one allowed rewrite); older
        versions' sections are never touched.
      - Bump each changed app's version code by exactly 1 (pubspec `+N`, Android versionCode).
      - In `.scratch/releases/<version>.md`, a `## Version codes` list: `rc.N: <app>=+<code>`.
      - Commit on `release/<version>`, then tag `v<version>-rc.N` (Pre-Release, UAT) on that
        commit. Push the tag only after a second yes.
   4. UAT fails → fix on `release/<version>`, back to 3. UAT passes → **ask**, then do 3 once
      more for `v<version>` (Release, Prod; record `release: <app>=+<code>`).
   5. Merge to `main` is the owner's. Never merge it. The release PR's checklist line reminds
      the owner to bump the version code +1 in that merge; lint on `main` checks it.
   Never tag, push or merge without a yes for that step.

## Rules

- The QA test plan and release notes go only on release PRs, not on ordinary feature PRs.
- Derive every statement from an acceptance criterion or a merged PR. Do not invent features.
- Report honestly: a missing link or criterion is written down, not hidden.
- Reversible work (reading history, drafting text, updating ADR/CONTEXT.md in the branch) is
  done without asking. Tagging, pushing and publishing are not.
