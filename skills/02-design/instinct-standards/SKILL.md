---
name: instinct-standards
description: Create or update repo-level engineering standards: ARCHITECTURE.md, CODING_STANDARDS.md, docs/domain-model.md, and ADRs. Use when initializing a project or documenting team rules.
disable-model-invocation: true
---

# Instinct Standards

Establish concise, enforceable project standards that `instinct-review` and the team can cite directly.

## Deliverables (create/update only what is missing)

1. **`ARCHITECTURE.md`:** System overview, folder/module structure, layer boundaries (who can call whom), and key data flows.
2. **`CODING_STANDARDS.md`:** Language/framework conventions, error handling, logging/redaction, testing rules, and comment rules.
3. **ADRs (`docs/adr/NNNN-<title>.md`):** Append-only decision records (Context, Decision, Consequences) for non-obvious architectural choices (*Why*).
4. **Domain Model (`docs/domain-model.md`):** Living truth of the domain—ubiquitous language, core entities, business invariants, and state transitions.

## Rules

- Keep every rule concrete and verifiable so a reviewer can cite `file:rule` without ambiguity.
- Omit anything a linter or formatter already enforces.
- Confirm major structural conventions with the user before writing.
