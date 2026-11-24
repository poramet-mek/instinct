---
name: instinct-concept
description: Capture an exploratory idea, future architecture, or deferred technical decision as a concise concept doc (`docs/concepts/<slug>.md`) without committing to implementation.
disable-model-invocation: true
---

# Instinct Concept

Turn a brainstorm or `/instinct-ask` discussion into a reusable concept record for future work (not yet an approved spec or enforced standard).

## Output (`docs/concepts/<slug>.md`)

- **Metadata:** `Status` (`Draft` | `Proposed` | `Adopted` | `Deferred` | `Superseded`), `Date`, `Revisit Trigger` (when to promote or act on it, e.g., post-POC / v1.0.0).
- **Context & Problem:** Why this came up and the current state.
- **Proposed Concept:** Target structure, diagram/table, or key design direction.
- **Guardrails (Now / During POC):** Rules to keep today so future migration is painless.
- **Trade-offs & Caveats:** Risks, alternatives considered, or constraints.
- **Open Questions:** Unresolved decisions before promoting to `/instinct-plan` or `/instinct-standards`.

## Rules

- Keep it concise: use bullets, tables, and ASCII/mermaid diagrams—no filler.
- Do not edit production code or treat a concept as an enforced project standard.
- If a concept file with the same slug already exists, update it in place rather than duplicating.
