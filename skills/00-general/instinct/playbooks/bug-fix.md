# Playbook: Bug Fix

Use for non-urgent bugs fixed on `develop`.

1. `git-workflow` — Branch `feat/fix-<name>` from `develop`.
2. `diagnosing-bugs` — Build a tight red loop first, minimise repro, prove root cause.
3. `tdd` — Add regression test and minimal fix.
4. `verify` — Confirm red loop is green and full test suite passes.
5. `unslop` — Remove temporary debug instrumentation and clean diff.
6. `instinct-review` — Review diff (`SHIP` / `DO NOT SHIP`).
7. `git-workflow` — After QA/review passes, commit, push, and open PR into `develop`.
