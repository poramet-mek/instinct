# Per-agent how-to

Skills say "hand it to a helper", "ask the owner" and "pick a model" without naming a tool.
This is where each agent does those things. Never invent a model name or flag: use only what
the agent's own `--help` documents or the owner configured; unsure means the default.

| | claude | codex | gemini | agy |
|---|---|---|---|---|
| Start a helper (inside Herdr) | `hc run --bg --name <n> --cwd <dir> -- claude "<task>"`, or the built-in Agent tool | `hc run --bg --name <n> --cwd <dir> -- codex.cmd --no-daemon "<task>"` | no hc template; run `gemini -p "<task>"` as a headless helper | `hc run --bg --name <n> --cwd <dir> -- agy --dangerously-skip-permissions -i "<task>"` (hc-launched helpers only) |
| Start a helper (outside Herdr) | `claude -p "<task>"` | `codex exec "<task>"` | `gemini -p "<task>"` | use the hc line above, or do the part yourself |
| Ask the owner | AskUserQuestion tool, or plain text | plain text | plain text | plain text |
| Pick a model | `--model <name>` flag, or the Agent tool's `model` argument | `-m <name>`; see `codex --help` | `-m <name>`; list with `gemini --list-models` | owner-configured only |
| Level std | `sonnet` | CLI default (no flag) | CLI default (no flag) | CLI default |
| Level high | `opus` | CLI default | `gemini-2.5-pro` | CLI default |
| Read a skill | skill is loaded by name (`/instinct-<name>`) | skill is listed by name; open its `SKILL.md` | `/instinct-<name>` command (installed by `instinct install`), which reads `skills/<name>/SKILL.md` | skill folder `~/.gemini/config/skills/instinct-<name>` |

Levels are what skills name (`std` for green/yellow work, `high` for red or design-heavy work);
`instinct dispatch --level std|high` turns them into the model flag from `LEVELS` in
`core/dispatch.js`. codex names come from `codex debug models` and gemini names from
`gemini --list-models` (both checked 2026-11-24); a level with no confirmed name runs at
the CLI default (codex high: CLI default until the owner picks a model). Change the table here and in `LEVELS` together.

No Claude: `INSTINCT_UNAVAILABLE=claude` (comma list) or `unavailable: [claude]` in
`.instinct/config.yml` keeps route and dispatch off those agents; red/design work goes to
codex, then gemini, and reviews always come from another company (gemini and agy are one).
The lead is whoever you name: `instinct route --lead <agent>` or `INSTINCT_LEAD=<agent>` wins. Otherwise
it is detected from the session (`CLAUDECODE`, `CODEX_*`, `GEMINI_CLI`); that is a heuristic and can be
wrong, so name the lead when it matters. A detected lead that is unavailable is reported as `none`.
Unavailable names other than claude|codex|gemini|agy print a warning on stderr and are ignored.

Helpers report with `hc send <lead-id> "<result>"` where `<lead-id>` is the lead's own
`$HC_TERMINAL_ID` written out literally (see `~/.agents/instinct.md`).

A plain-text question is always enough: ask, stop, and wait for the owner's answer.
