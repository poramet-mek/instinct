---
name: instinct-on-delegate
description: Split work and hand parts to other agents that are on (per the "instinct: agents" block) or to helpers, then score the results. Use on your own when work splits into 2+ independent parts, when a 🔴 change needs a cross-vendor review, or when the user asks for a second opinion or to "ให้ agent อื่นช่วย".
---

# on-delegate

CLI: `node <instinct>/bin/instinct.js`, where `<instinct>` is the repo that holds this skill
(this file is `<instinct>/skills/on-delegate/SKILL.md`; resolve the symlink).

Task types (keep to these so scores add up): `review`, `build`, `test`, `bug`, `docs`, `research`, `design`.

## Steps

1. **Split.** Break the work into parts with no shared files. Each part gets an exact scope:
   files, what to do, read-only or not, and how to report.

2. **Pick agents.** Only agents listed `on` in the session's "instinct: agents" block (or `instinct agents`). For each part run `instinct route --type <type>`; it already leaves out the others.
   - `by scores` or `rotate` → use that agent (`claude` = a helper of the Claude kind from the table).
   - `static` → use the routing table in `~/.agents/instinct.md`.
   Every build is reviewed by the `reviewer` that `route` prints, a different vendor from the
   builder. A 🔴 change always also gets a reviewer from another vendor. If `route` says no other vendor is on, review with a Claude subagent (`surgeon-reviewer`, or roles/surgeon-reviewer.md via `instinct dispatch`) and tell the user in one line.

3. **Show the plan.** Always show it: part → agent → why. Start at once if every part is
   within the criteria (independent parts, 🔴 cross-vendor review, a second opinion the user
   asked for). Otherwise wait for the user.

4. **Dispatch.** Inside Herdr (`$HC_TERMINAL_ID` set) use `hc run --bg` as in `~/.agents/instinct.md`,
   ending the task with "report with `hc send <your id> ...`" where `<your id>` is your own
   `$HC_TERMINAL_ID` written out literally (e.g. `t2h`). Inside the helper that variable is the
   helper's own terminal, so passing it unexpanded makes the helper report to itself.
   Outside Herdr use a headless CLI (e.g. `codex exec "<task>"`) or a helper; per-agent how-to is in `<instinct>/docs/agents.md` (`<instinct>` is the repo holding this skill; resolve the symlink).
   Never approve another agent's permission prompt; ask the user.
   **Fallback, automatic (owner, 2026-11-23).** If the agent cannot start, is blocked (auth,
   model unavailable, quota), errors out, or makes no progress for 10 minutes, kill its
   terminal and re-dispatch the same task without asking. "Progress" means new terminal
   output or changed files; a quiet test run is not a stall if its process is still alive.
   - **Next agent.** Build: re-run `instinct route --type build --skip <all failed>` and use
     what it returns. Other types (`--skip` only works for build): the next untried agent that is
     `on` in the "instinct: agents" block. gemini and agy are one company (Google): never builder and reviewer of the same work.
   - **Clean slate.** Before re-dispatching, revert the failed agent's changes to that task's
     files (back to the task's starting point) and note it in the state file.
   - **Remember.** Record the failed vendor and why in the autopilot state file if one exists,
     and pass every vendor recorded there to `--skip` for the rest of the run.
   - **Scores.** Never started → not scored. Started, then errored or stalled → score it with
     correct 0 and say so in the note.
   - **Reviewers** fall back the same way, never to the builder's own vendor.
   - **Pause.** If it is unusable for a while (quota, usage limit, model unavailable), propose
     `instinct agents pause <agent> --until <date if known> --reason <short>` and ask the owner; never pause on your own.
   Say in one line which vendor failed and why. No allowed agent left → stop and report.

5. **Check the result yourself.** Read the actual output and diff, run the tests. Never pass
   on a claim you did not verify. Clean up hc terminals (`hc kill <t>; hc rm <t>`).

6. **Score every finished part:**
   `instinct score add --agent <agent> --type <type> --correct 0-2 --scope 0|1 --rework N --honest 0|1 --task <id> --evidence <commit|PR|log> [--minutes N]`
   - correct: 2 = tests and review pass with no fixes, 1 = needed fixes, 0 = wrong or unusable.
   - scope: 1 = touched only what it was given.
   - rework: rounds sent back for fixing.
   - honest: 0 if it claimed something untrue (tests passed, file changed) or hid a skipped step.
   Tell the user the scores. If they disagree, record theirs with `--by user` and the same `--task`; it replaces yours.

## Rules

- No nested delegation: helpers you start do not start agents.
- Each vendor spends its own quota: do not delegate what you can do quickly yourself.
- `instinct score show` lists the table; the user may ask to see it at any time.
