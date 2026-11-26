# Playbook: Feature

Use for medium-to-large features on `develop`.

1. `git-workflow` — Branch `feat/<name>` from `develop`.
2. `grilling` — Settle open requirement and edge-case decisions.
3. `instinct-flow` — *(If multi-screen UI with branch/error paths)* Draft the flow and get owner approval.
4. `architect` — Sketch topology, data flow, module boundaries, signatures, and security controls.
5. `instinct-figma` — *(If UI)* Implement from Figma one frame/node at a time, following the approved flow.
6. `tdd` — Implement in vertical slices (red -> minimal green -> refactor).
7. `verify` — Run unit/integration tests and failure-path checks with real output.
8. `instinct-standards` — *(If architecture, boundaries, APIs, or concepts changed)* Sync `ARCHITECTURE.md`, `CONTEXT-MAP.md`, `docs/concepts/` status, and record an ADR if a new architectural decision was made.
9. `unslop` — Clean diff, remove AI tells, enforce concise comment rules.
10. `instinct-review` — Ruthless diff review (`SHIP` / `DO NOT SHIP`).
11. `git-workflow` — After QA/review passes, commit, push, and open PR into `develop`.
