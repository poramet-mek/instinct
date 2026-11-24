# Playbook: Refactor

Use when restructuring code without changing external behavior.

1. `verify` — Run existing tests first to establish a green baseline.
2. `architect` — Sketch target module boundaries and interfaces.
3. Refactor in small safe steps, keeping tests green after each step.
4. `verify` — Re-run full test suite to confirm no behavior changed.
5. `instinct-standards` — *(If module boundaries, packages, or architecture changed)* Sync `ARCHITECTURE.md`, `CONTEXT-MAP.md`, `docs/concepts/` status, repo tooling rules, and record an ADR if an architectural decision was adopted.
6. `unslop` — Remove leftover dead code and redundant comments.
7. `instinct-review` — Check for `WILL ROT` / coupling regressions.
