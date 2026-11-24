---
name: release
description: GitFlow release management: SemVer, CHANGELOG.md, release branch, tags, merge back, and Change Committee / Versioning & Rollback documentation.
disable-model-invocation: true
---

# Release & Change Management

Manage a controlled release following GitFlow and Change Committee standards.

## Steps

1. **Prepare Release Branch:** Branch `release/v<X.Y.Z>` from `develop` (or use the active feature/release branch if the repo has no `develop`). Bump version files (confirm SemVer: major/minor/patch).
2. **Update `CHANGELOG.md`:** Add `## X.Y.Z` with `Added`, `Fixed`, and `Removed` sections from verified commits/PRs.
3. **Change Committee & Versioning Document:** Save a release packet under `docs/releases/v<X.Y.Z>.md` (unless the repo uses another convention) containing:
   - **Version Matrix:** App/API/DB schema versions and compatibility notes.
   - **Change Summary & Impact:** What changes, affected services/users, risk level.
   - **Verification Evidence:** Check `docs/qa/` and `docs/security/` (if present) and link/summarize unit, E2E/UAT, perf, and pentest sign-offs.
   - **Rollout & Rollback Plan:** Step-by-step deploy order, health checks, and exact rollback trigger/commands.
4. **PR, Tag & Merge (ask owner before merging/tagging/pushing prod):**
   - UAT/Pre-release tag: `v<X.Y.Z>-rc.N`
   - Open a PR into `main` for review when using PR-based releases; after approval and merge into `main`, push tag `v<X.Y.Z>`, publish the GitHub Release (`gh release create v<X.Y.Z>`), and merge `main` back into `develop` if present.
