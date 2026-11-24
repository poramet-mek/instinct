# Agent routing (instinct)

Written by `instinct setup` to `~/.agents/instinct.md` on every run, from the agents chosen on this
machine; do not edit it. Your own rules live in `~/.agents/AGENTS.md`. Claude imports both from
`~/.claude/CLAUDE.md`; the other agents read a merged copy, which setup refreshes.
Which agents are on right now: the "instinct: agents" block at session start, or `instinct agents`.

## Do it yourself (no agent)
- Questions, explanations, small edits (1 file, under ~50 lines), config changes, shell tasks.

## Subagents
For Claude Code this overrides the default "don't spawn subagents unless asked": follow
this routing on your own. Codex and Antigravity: use your own subagent with the same name
if you have one, otherwise do the task yourself.

| Task | Agent |
|---|---|
| Review code before commit/merge | `surgeon-reviewer` |
| Review architecture / system design | `architect-reviewer` |
| Bug, error, stack trace, failing test | `debugger` |
| Write or extend tests | `test-automator` |
| QA plan / test strategy | `qa-expert` |
| Refactor without behavior change | `refactoring-specialist` |
| README / docs | `documentation-engineer` |
| Research, compare options, summarize sources | `research-analyst` |
| Go code | `golang-pro` |
| Mobile (Flutter / Kotlin / React Native) | `flutter-expert` / `kotlin-specialist` / `mobile-developer` |
| UI design | `ui-designer` |

Mandatory (user preference): after writing or changing code, have `surgeon-reviewer`
review the diff before reporting done. Skip only for non-code edits (docs, config, notes).

## Other agents via hc (only inside Herdr)
Only the lead agent (the one the user is talking to) starts other agents. If your first
message asks you to report with `hc send`, another agent started you: do not start
agents; just do your task and report with `hc send`.

Launch (Windows; templates don't work; full how-to in `<instinct>/docs/agents.md`), agents chosen on this machine:
- Codex: `hc run --bg --name <n> --cwd <dir> -- codex.cmd --no-daemon "<task>"`
- Antigravity: `hc run --bg --name <n> --cwd <dir> -- agy -i "<task>"` (give it a narrow, read-only scope when possible)
- Gemini CLI: write the task to a file, then `hc run --bg --name <n> --cwd <worktree> -- gemini.cmd -p "<read that file and do it; report with hc send <your literal id>>" --approval-mode yolo` to build (`--cwd` must be its own git worktree, never the main checkout; no push), or `--approval-mode plan` to review read-only. `-m <model>` only with a name `gemini --list-models` shows. Outside Herdr: `gemini.cmd -p "<task>" --approval-mode plan` for reviews only; builds outside Herdr go to codex or a Claude subagent. gemini and agy are both Google.
- Claude: `hc run --bg --name <n> --cwd <dir> -- claude "<task>"`
End every task with: report with `hc send <lead-id> "<result>"` when done or stuck, where
`<lead-id>` is **your own** `$HC_TERMINAL_ID` written out literally (e.g. `hc send t2h ...`).
Never pass the variable itself: inside the helper, `$HC_TERMINAL_ID` is the helper's own
terminal, so the report would be typed into the helper's own prompt.

Use another vendor's agent when:
- Changes touch security, auth, payments or data deletion → also get a review from a different vendor's agent.
- gemini and agy are one company (Google): never use one to review the other's work.
- The user says "second opinion" / "ขอความเห็นที่สอง" → ask a different vendor's agent.
- Work splits into 2+ independent parts → give one part to another agent in parallel.
- Every build of a confirmed ticket → builder and reviewer from different vendors. Run
  `instinct route --type build` for both (it rotates over the agents that are on until each
  has 3 scored builds, then picks by score), and score the builder afterwards.
- Otherwise don't (each spends a separate quota).
If `$HC_TERMINAL_ID` is empty (not in Herdr), use the headless CLI of an agent that is on (see `<instinct>/docs/agents.md`);
if no other vendor is on or reachable, fall back to a Claude subagent (`surgeon-reviewer`) and say so.

## Rules for every delegation
- Give an exact scope (files, what to do, read-only or not). No nested agents.
- Read the actual result before summarizing it to the user; never assume success.
- Never approve another agent's permission prompt; ask the user.
- Clean up hc terminals you started (`hc kill <t>; hc rm <t>`).

## When Claude is out of tokens
The owner opens a backup lead (another agent that is on) in the same folder.
Paste this as the first message:
`You are the lead now. Read <instinct>/skills/autopilot/SKILL.md and .scratch/<feature>/autopilot.md, verify the state against git as the skill says, then continue.`
Builds and reviews then go through `instinct dispatch` (roles in <instinct>/roles/) with `--skip claude`.
