# Playbook: Hotfix

Use for urgent production bugs branched from `main`.

1. `git-workflow` — Branch `hotfix/<name>` from `main`.
2. `diagnosing-bugs` — Build red loop, minimise repro, prove root cause.
3. `tdd` — Add regression test and smallest safe fix.
4. `verify` — Run focused + full checks with real evidence.
5. `instinct-review` — Ruthless review (`SHIP` / `DO NOT SHIP`).
6. `release` — Patch SemVer bump, `CHANGELOG.md`, release packet, tag `vX.Y.Z`, and merge back to `main` and `develop`.
