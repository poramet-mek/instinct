# Playbook: QA & Release

Use when preparing a release candidate or production release with full documentation.

1. `instinct-qa-doc` — Draft E2E cases (incl. failure modes), run & capture evidence, generate UAT doc (`docs/qa/`).
2. `instinct-perf` — Validate SLA targets and burst load tests.
3. `instinct-pentest` — Run staging security/race checks and save Pentest Report (`docs/security/`).
4. `release` — Cut `release/vX.Y.Z`, update `CHANGELOG.md`, build Change Committee doc (`docs/releases/`), tag, and merge back.
