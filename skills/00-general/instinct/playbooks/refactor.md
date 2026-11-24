# Playbook: Refactor

Use when restructuring code without changing external behavior.

1. `verify` — Run existing tests first to establish a green baseline.
2. `architect` — Sketch target module boundaries and interfaces.
3. Refactor in small safe steps, keeping tests green after each step.
4. `verify` — Re-run full test suite to confirm no behavior changed.
5. `unslop` — Remove leftover dead code and redundant comments.
6. `instinct-review` — Check for `WILL ROT` / coupling regressions.
