---
name: instinct-autopilot
description: Run every ready ticket of a feature through build, test, cross-vendor review and commit without being asked between steps, then open one PR for the feature and stop for the owner's review. Use when the user says "autopilot", "ทำให้ครบจน PR", "ทำต่อเองทั้งหมด", "loop ticket", or asks to finish a feature's tickets without typing each step.
---

# Autopilot

One command, `/instinct-autopilot <feature>`, takes a feature from ready tickets to one PR.
Typing this command is the owner's standing yes for commit and push on `feat/*` and for
opening the PR (owner, 2026-11-23), and for merging `feat/<feature>-<NN>` into `feat/<feature>`
and deleting those ticket branches and worktrees (owner, 2026-11-24). It is never a yes for
`main`, merging into the base branch or `main`, or red-tier actions.

CLI: `node <instinct>/bin/instinct.js` (`<instinct>` is the repo holding this skill).

## State file

Keep `.scratch/<feature>/autopilot.md` up to date after every step: branch, base branch, the
ticket in hand, the step it is on, fix rounds used, commit hash of each ticket, parked
tickets and why. In a parallel round, one line per ticket: worktree path, branch, vendor,
model and reason, hc terminal, step, fix rounds, hash. Only the lead reads and writes this file, in the
main tree; builders never see it. It is never committed (keep it untracked). On start, read it first and resume
from it (survives a context reset and compaction). Delete it at the final stop of step 7, whether a
PR was opened or not.

## Loop

1. **Branch.** Fresh start (no state file): clean `git status` first; dirty → stop and ask,
   unless every changed file is in the area of a ticket left by another skill (step 2).
   Resume: the uncommitted changes the state file explains (the ticket in hand, its status
   edit, the state file) are expected; anything else → stop and ask.
   Already on this feature's branch → stay. Otherwise create `feat/<feature>` from the branch
   the work depends on: the branch holding the tickets it is blocked by (not yet merged), else
   `main`. Record that base in the state file and say why; risk, PR body and PR all use it.
   Never commit or push to `main`.
2. **Pick.** Next ticket in number order whose `**Status:**` is `ready-for-agent` and whose
   `**Blocked by:**` tickets are `in-review`, `done`, or parked (code committed, only a
   device/owner check open).
   - `needs-info` / `needs-triage` tickets: collect all their open questions and ask in
     **one** round (instinct-on-requirement); after answers, update the tickets and continue.
   - mattpocock tickets work as they are (no `**Release:**` line needed; add it only when
     setting `in-review`). `ready-for-human` → not built, listed as waiting on the owner;
     `wontfix` / `done` → skipped; `map.md` and tickets with a `Type:` line (wayfinder) are
     not build work. Keep the same headings and statuses so `/implement` and `/triage` still
     read what instinct writes.
   - **Left by another skill** (e.g. mattpocock `/implement`, which never changes the status):
     with no state file, look for evidence, not status. Evidence = uncommitted changes, or
     commits on the current branch not on its base, that touch a ticket's **area** (files
     named in the ticket, or under the module its "What to build" names). Such a ticket,
     `ready-for-agent` or `in-progress`, is picked first: run the tests and continue from
     there (fix, review, commit); never discard or redo it. Decide per file: a changed file in
     no open ticket's area, or in more than one ticket's area and named by none of them → stop and ask. Commit only the files assigned to that ticket.
   - Nothing pickable at the very start → say so, list each ticket with what blocks it, stop.
   - None left to pick → step 7.
3. **Build** each ticket exactly as `instinct-on-build` says (gate, route, TDD, review by the
   route's reviewer plus `surgeon-reviewer` (or roles/surgeon-reviewer.md via `instinct dispatch` on any vendor), scoring). Do not stop to report between its steps.
   Pick a **round**, not one ticket, and run it as in "Parallel rounds" below.
4. **Fix rounds.** Failing tests or a NO-SHIP review → fix and re-run. After **3** rounds
   still failing → stop the whole loop and report (what fails, the output, what was tried).
   Exception: a builder on the std level gets one extra round on the high level
   (`instinct dispatch --level high`, round 4) first; still failing → stop. Not for 🔴 tickets (already on high) or step 7 fixes.
5. **Parking.** A criterion only a device, real server or the owner can check → leave it
   unticked, set `**Status:** in-progress (waiting for <what>)`, add it to Follow-ups, commit
   what is done, and go on to the next ticket. Parked tickets do not block the PR; list them in it.
6. **Commit.** Run `instinct lint` on the uncommitted work. Warnings → stop and show them.
   Clean → commit the ticket's code together with its ticket file set to `in-review` (subject
   says what was added/fixed/removed, no AI attribution). Not the state file. Record the hash
   in the state file only (it goes into the PR body), and go back to step 2.
7. **PR.** Run `instinct-before-pr` over the branch with `--base <base>` for both
   `instinct risk` and `instinct pr-body` (reviews by tier, evidence). Under autopilot: the
   feature branch counts as one topic (no split proposal), and with no config skip the config
   draft and treat `pr_access` as `manual`. Fixes from its reviews follow step 4: at most 3
   rounds, then stop and report. Then by `pr_access`:
   - `cli:<tool>` / `mcp:<server>` → push `feat/<feature>` and open one PR for the feature.
   - `manual` or no config → do not guess a platform: push only if a remote exists, then give
     the title and body ready to paste.
   Stop. Report: PR link or text, tickets done, parked tickets with what the owner must run,
   every `ready-for-agent` ticket left unbuilt with its blocker, every failed or blocked command.
   With `pr_access: cli:*`, before stopping start the watch (see Feedback).

## Feedback (owner decisions 2026-11-24)

Entry points: `/instinct-autopilot pr <n>`, `issue <n>` (read with the `pr_access` CLI, e.g.
`gh pr view <n> --comments`), or `feedback <feature>` with the review text pasted (works with
no remote). No `pr_access` and no pasted text → ask for the text; never guess a platform.

**Watch file.** `.scratch/<feature>/watch.md` (untracked) holds the PR or issue number, branch,
base branch, the last handled comment id, and items asked about but not yet answered. Write
it when a PR is opened; it outlives the state file; delete it only when the PR is merged or
closed. Every reply the agent posts starts with `<!-- instinct-autopilot -->`; comments
carrying it are never feedback.

An `issue <n>`: find the feature from the issue's text and `.scratch/` (unclear → ask). Its
fixes go to that feature's open PR if any, else a new `feat/*` branch and PR; the reply goes
on the issue.

1. **Triage.** Take only comments after the last handled id, skipping tagged ones. While a
   question is open, only look for the owner's answer; never re-triage the asked items.
   Split the feedback into items. Each item becomes a new ticket numbered after
   the last one, linking the comment/issue as its source. Clear items → `ready-for-agent` at
   once, no question. Unclear items → ask all of them in **one** round. Work that says an
   earlier ticket is wrong → a new ticket linking the old one; the old one stays as history.
   An item outside this feature's spec → do not add it to this PR; propose a new feature.
   Record handled and asked items in the watch file before building.
2. **Loop.** Run the Loop above on the **same branch** with the base from the watch file
   (not a fresh start: skip the branch step).
3. **Hand back.** Push to the same PR, reply under each comment with the commit that fixed
   it (standing yes for these replies, tagged as above), set the last handled id to the
   newest comment including your own replies, list the new tickets, and stop.
4. **Watch.** With `pr_access: cli:*`, start `/loop 30m /instinct-autopilot pr <n>` after
   opening or updating a PR. Each run: new "changes requested" or new owner comments since
   the last handled one → step 1; nothing new → end the turn quietly. PR merged or closed →
   stop the loop and delete the watch file.

## Other workspaces

Any repo in the owner's dev folder (the parent of the instinct repo) may be read. To learn something from another workspace:
1. Read its code and docs directly, read-only. This answers most questions.
2. Need a command there (tests, a read-only query) → only if you are the lead agent inside
   Herdr, start your own helper as `~/.agents/AGENTS.md` says (`hc run --bg --name <n>
   --cwd <repo> -- <vendor cmd>`), with a read-only task reporting via `hc send <your literal
   id>`. Otherwise hand it to a helper (see `<instinct>/docs/agents.md` (`<instinct>` is the repo holding this skill; resolve the symlink)) that reads that repo.
3. Message a session already open there only when its own context is needed, and tell the
   owner at once that they must confirm in that window: a relayed message never carries
   the owner's approval.
4. Secrets (activation codes, passwords) or writes on a server → only the owner. Park the
   ticket with what is needed and go on.

## Parallel rounds (owner, 2026-11-24)

- **Round.** All pickable tickets whose areas (step 2) share no file, at most **3**. Tickets
  that share files, or whose area is unclear, wait for a later round. Device tests stay one
  at a time (one test device).
- **Worktree.** Each ticket gets `git worktree add ../<repo>-<feature>-<NN> -b feat/<feature>-<NN>`
  from the feature branch (`/` in the feature name → `-` in the folder). Its builder works only
  there. On resume, reuse a worktree or branch the state file lists; never add it again.
  A fresh worktree has no untracked files: the builder installs dependencies there
  (`npm ci`, `flutter pub get`, …) and that setup does not count as a fix round. Tests that
  need secrets or `.env` → park the ticket; never copy secrets into a worktree.
- **Vendors.** One available vendor per ticket in the round (gemini, codex, agy, claude), using
  `instinct route --type build --size <S|M|L> [--design] [--red] --skip <vendors already used this round, and failed ones>`;
  fallback as in `instinct-on-delegate` step 4. More tickets than vendors → extra helpers of the lead's own agent
  (see `<instinct>/docs/agents.md` (`<instinct>` is the repo holding this skill; resolve the symlink) for starting one).
- **Model level** (owner, 2026-11-24; the one place this rule lives). Before building,
  `instinct risk` cannot see a ticket (no diff yet): the lead judges the tier from the
  ticket's area against the red-path rules (secrets, auth, payments, data deletion, network
  ports, migrations); unsure → 🔴. After the build, `instinct risk` on the diff sets the
  reviewer's level; a tier raised by it means review at the higher level.

  The table names levels, not models; each vendor's model for a level is in the level table of `<instinct>/docs/agents.md` (`<instinct>` is the repo holding this skill; resolve the symlink).

  | Role | 🟢 green | 🟡 yellow | 🔴 red / design-heavy |
  |---|---|---|---|
  | Builder (incl. fix rounds) | std | std | high |
  | Reviewer (re-reviews too) | std | std | high |

  Pass the level with `instinct dispatch --level std|high`, which sets each vendor's model
  from the level table (a level with no confirmed name runs at the CLI default, no flag).
  Never invent a model name or flag. A default run is not a vendor failure and does not
  trigger the fallback. No level below std. Record role, level, model and reason in the state file.
- **Review as each finishes**, in its worktree; fix rounds per step 4.
- **Merge back** into `feat/<feature>` in ticket-number order: a finished ticket waits until
  every lower-numbered ticket of the round has merged or left the round (stopped). A parked
  ticket (step 5) merges once its code is committed and reviewed. A conflict → stop and ask.
- **Clean up** after each merge: `hc kill`/`hc rm` its builder terminal, then
  `git worktree remove` and delete its branch. Removal fails (Windows file locks) → report
  it and leave the worktree; never `--force`.
- **After the round**, run the full tests on `feat/<feature>`. A failure there gets fix
  rounds against the round (max 3, step 4), then stop.
- **Stopping mid-round** (step 4 cap, a question, a conflict): kill the helper terminals,
  keep the worktrees and branches, record them in the state file, and report.

## Context and memory (owner, 2026-11-24)

The agent cannot reset its own context; only the owner can. Compaction can also happen on its own.
- **Stay light.** Builds and reviews go to helpers (fresh context each time); the lead keeps
  only their summaries.
- **Write before moving on.** Every owner answer goes into the ticket, spec or state file
  before the next step. Chat alone is not memory.
- **Verify on resume, never trust recall.** After a context reset, compaction or a new session:
  - merged tickets: `git merge-base --is-ancestor <hash> HEAD`; if not, match by commit
    subject and the ticket file's status;
  - tickets still in a round: their worktree is in `git worktree list` and branch exists;
  - each ticket file's `**Status:**` matches what the state file says.
  Still no match → stop and ask, naming the likely cause (e.g. the owner rebased or amended).
- **End of each round:** one line to the owner: "round N done; you may reset the context, state is in
  `.scratch/<feature>/autopilot.md`; resume by running the autopilot skill for <feature>".

## Always stop and ask for

- Red-tier actions (secrets/.env, dropping or overwriting data, machine-wide installs,
  sending files off the machine), even mid-ticket.
- Lint warnings, a dirty tree at start, failed fix rounds (step 4 cap), a design change outside the
  ticket's criteria.

## Rules

- Never merge into `main` or the base branch; the owner merges those. Merging ticket
  branches into `feat/<feature>` (Parallel rounds) is allowed.
- One PR per feature.
- Report only at stops. Between tickets, one line of progress is enough.
- Every rule of the skills it calls still applies; this skill only removes the wait between them.
