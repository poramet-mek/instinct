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
