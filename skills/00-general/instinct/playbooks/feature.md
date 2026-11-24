# Playbook: Feature

Use for medium-to-large features on `develop`.

1. `git-workflow` — Branch `feat/<name>` from `develop`.
2. `grilling` — Settle open requirement and edge-case decisions.
3. `architect` — Sketch topology, data flow, module boundaries, signatures, and security controls.
4. `instinct-figma` — *(If UI)* Implement from Figma one frame/node at a time.
5. `tdd` — Implement in vertical slices (red -> minimal green -> refactor).
6. `verify` — Run unit/integration tests and failure-path checks with real output.
7. `unslop` — Clean diff, remove AI tells, enforce concise comment rules.
8. `instinct-review` — Ruthless diff review (`SHIP` / `DO NOT SHIP`).
9. `git-workflow` — Clean commit and PR into `develop`.
