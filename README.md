# instinct

Proactive, self-learning skills for a team of AI agents (Claude leads; Codex and
Antigravity/Gemini follow). See [docs/spec.md](docs/spec.md).

`reference/mattpocock-skills/` is a copy of [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT, © 2026 Matt Pocock), kept for reference only. Portions adapted from it keep that credit.

## New machine

Windows, one click: download and double-click [`install/windows/setup.cmd`](install/windows/setup.cmd)
together with `setup.ps1`, or paste in PowerShell:

```powershell
irm https://raw.githubusercontent.com/poramet-mek/instinct/main/install/windows/setup.ps1 | iex
```

It installs what is missing (Node, Git, Herdr, claude, codex, gemini, agy), clones instinct
to `~\instinct` (or pulls it), runs `instinct setup --apply` and `doctor`, then lists the
logins left to do. Run it again to update. `setup.ps1 -DryRun` shows the plan only.

By hand, any OS:

```sh
git clone <repo-url> instinct && cd instinct
node bin/instinct.js setup            # dry run: lists every change
node bin/instinct.js setup --apply    # hooks, skill links (_instinct__<name>), ~/.agents/AGENTS.md, Gemini context
node bin/instinct.js doctor           # every row should be ok
```

Re-run after `git pull` to update; it never replaces files that are not instinct's.

### Uninstall

```sh
node bin/instinct.js setup --remove            # dry run: lists what would be removed
node bin/instinct.js setup --remove --apply    # undo setup on this machine
```

Removes only instinct's items: hooks, `_instinct__*` skill links (and agy/Gemini copies),
`~/.agents/instinct.md`, `~/.instinct/config.yml`, the import lines in `~/.claude/CLAUDE.md`
and instinct's Gemini context entries. Files you edited are kept and listed; each deleted file
is backed up as `*.bak-<time>` (links are only unlinked).

`uninstall --apply` (below) is narrower: it removes only the merged hooks and agy/Gemini copies.

## Usage (MVP 1)

```sh
npm test                                   # node --test, no dependencies
node bin/instinct.js install               # dry run: shows what would merge into each agent
node bin/instinct.js install --apply       # merge hooks (backs up each file as *.bak-<time>)
node bin/instinct.js uninstall --apply     # remove only instinct's entries
node bin/instinct.js record --tier project --id <kebab-id> --type do|avoid \
  --rule "..." --why "..." --how "..." [--tags a,b] [--trigger '[{"event":"pre-tool","tool":"shell","command":"git commit*"}]']
```

Skills: folders in `skills/` are short (`on-build`); each `name:` keeps the `instinct-` prefix.
- With skillshare (`skillshare link <instinct>/skills`): commands are `/_instinct__on-build`.
- Without skillshare: link each folder under the prefixed name, e.g.
  `ln -s <instinct>/skills/on-build ~/.claude/skills/instinct-on-build` → `/instinct-on-build`.
- agy: `install --apply` copies them as `instinct-on-build` (agy follows no symlinks).

Lessons: `lessons/` (general) and `<project>/.instinct/lessons/` (project), each with `INDEX.md`.
Trigger events: `session-start`, `prompt`, `pre-tool` (`tool: shell|edit`, `command`, `path`), `post-edit` (`path`).

| Agent | Config | Events used |
|---|---|---|
| Claude | `~/.claude/settings.json` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse |
| Codex | `~/.codex/hooks.json` (approve via `/hooks`) | same |
| agy | `~/.gemini/config/hooks.json` | SessionStart, PreInvocation (prompt lessons only) |

Hooks only inject context and fail open; they never block a tool.
