# Changelog

## 2.0.1 (2026-11-25)

### Changed
- `release` skill now explicitly includes publishing a GitHub Release (`gh release create v<X.Y.Z>`) after pushing the version tag.
- `git-workflow` skill is now fully self-contained (removed repo-specific `docs/multi-account-git.md` reference).

## 2.0.0 (2026-11-25)

### Added
- 22 lean, modular SDLC atomic skills across 6 core phases (`00-general` through `06-ops`), including:
  - `instinct-handoff`: Git-grounded session handoff (`HANDOFF.md`) and drift-checked resume.
  - `retro`: Post-session retrospective to improve living docs, steering files, and checks.
  - `instinct-concept`: Capture future concepts, RFCs, and POC guardrails (`docs/concepts/`).
  - `instinct-manual`: Screenshot-backed `user-manual-for-<slug>.md` with iterative discovery, gap reporting, troubleshooting, and target-persona review.
- 12 orchestrator playbooks under `skills/00-general/instinct/playbooks/`.
- Zero-dependency Node.js (`>=20`) CLI installer (`bin/instinct.js`) supporting `list`, `install`, and `uninstall` across `claude`, `codex`, `agy`, and `gemini`, plus one-command `npx github:poramet-mek/instinct install --apply`.
- Multi-account Git and GitHub CLI setup guide (`docs/multi-account-git.md`).
- Change Committee release packet (`docs/releases/v2.0.0.md`).

### Fixed
- Installer now forces `copy` mode with `.instinct-managed` marker when run from ephemeral `_npx` or `node_modules` paths, preventing dangling symlinks.

### Changed
- Rewrote `instinct` to v2.0.0 with concise skills (`<= 80` lines each) and `disable-model-invocation: true` for user-only skills.
- Updated `README.md` and `test/installer.test.js` for all 22 skills and 12 playbooks.

### Removed
- Legacy v1.x setup scripts and monolithic prompt templates replaced by modular v2.0.0 skills.
