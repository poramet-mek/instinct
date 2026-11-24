---
name: git-workflow
description: GitFlow branching, clean commits, and PR hygiene. Use when creating branches, committing, merging, or preparing a pull request.
---

# Git Workflow (GitFlow)

Follow strict GitFlow and clean commit hygiene.

## Branches

- `main`: Production-ready code only. Never commit or push directly to `main`.
- `develop`: Integration branch for next release.
- `feat/<name>`: Branched from `develop`; merged back to `develop` via PR.
- `release/v<X.Y.Z>`: Branched from `develop` for release stabilization; merged to `main` and `develop`.
- `hotfix/<name>`: Branched from `main` for urgent prod fixes; merged to both `main` and `develop`.

## Commit & PR Rules

- Start and finish with a clean `git status` (no stray untracked/debug files).
- **Commit subject:** Imperative, stating what was added, fixed, or removed (body optional).
- **No AI attribution:** Never add `Co-Authored-By` or AI-generated trailers to commits or PRs.
- Keep each PR focused on one logical change; include what changed and how it was verified.
- **Docs as Living State (Exit Gate):** Before committing or opening a PR that changes architecture, boundaries, APIs, or behavior, ensure affected docs (`ARCHITECTURE.md`, `CONTEXT-MAP.md`, `docs/concepts/`, ADRs) are updated in the same change.
- **Auto-PR after QA/Review:** Once QA/verification (`verify`, `instinct-review`) passes on a `feat/*` branch, commit, push, and open a PR into `develop` automatically (still ask the owner before merging/pushing to `main`).
- **Multi-account check:** Before pushing or running `gh pr create`, verify the active account (`git config --show-origin --get-regexp credential`, `gh auth status`). If `gh` is logged into another account and the repo owner is already logged in, switch temporarily (`gh auth switch --user <owner>` -> `gh pr create` -> switch back); otherwise share the GitHub compare/PR URL.
