# Changelog

## 1.1.2

### Fixed
- Windows uninstall no longer reports a step as done when a cmdlet fails, e.g. the clone folder is in use.

## 1.1.1

### Fixed
- README documents uninstall (`instinct setup --remove`) and how it differs from `uninstall`.

## 1.1.0

### Added
- Choose which agents a machine uses; the others are never routed to (`instinct setup --agents`, saved in `~/.instinct/config.yml`).
- The Windows installer asks which agents to install; Gemini CLI is off by default and a re-run keeps the saved choice.
- `instinct agents` and an "instinct: agents" block at session start; skills pick helpers and reviewers only from agents that are on.
- Routing rules move to `~/.agents/instinct.md`, rewritten by setup; your own lines from the old routing part are kept in `~/.agents/AGENTS.md`.
- `instinct agents pause <agent> [--until <date>] [--reason ..]` and `resume`.
- One-click uninstall: `instinct setup --remove` and `install/windows/uninstall.cmd`.

### Fixed
- The installer no longer reports the doctor step as failed when some agents are off.

## 1.0.0

### Added
- `instinct setup`: hooks, skill links, shared rules and Gemini context on a new machine.
- One-click Windows installer (`install/windows/setup.cmd`, or `irm .../setup.ps1 | iex`).
