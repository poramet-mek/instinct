---
name: instinct-on-design
description: Shape an agreed requirement into a module plan, ADRs and implementation boundaries before building. Use on your own after the requirement gate for non-trivial work or when architecture is uncertain, including "design this", "write an ADR", "how should we structure this?", "ช่วยออกแบบ", "ทำ ADR".
---

# On design

Design from confirmed acceptance criteria and keep the source link nearby. Read relevant `CONTEXT.md`, ADRs, and code before proposing a shape.

## Steps

1. Identify affected modules, callers, data, and constraints from the codebase. Resolve facts by inspection.
2. Propose a module shape: responsibilities, interface, seam, dependencies, and key data flow. Prefer a deep module with a small, testable interface and local complexity.
3. Compare credible alternatives and state their trade-offs. For large, cross-cutting, or hard-to-reverse decisions, grill the user in rounds (plain-text questions are fine; see `<instinct>/docs/agents.md` (`<instinct>` is the repo holding this skill; resolve the symlink)) on unresolved choices; recommend an answer for each question.
4. Keep the domain language sharp: when a term is vague, overloaded or new, propose a definition and ask, then record it in `CONTEXT.md` (create it if missing). Record an ADR when the decision is hard to reverse, surprising without context, and chosen among real trade-offs, using `<instinct>/templates/adr.md` (`<instinct>` is the repo that holds this skill; resolve the symlink) in `docs/adr/NNNN-<slug>.md`. If that folder is not found (e.g. a copied install), use the template path given in the session-start "instinct: documents" block. Update relevant team/agent context and identify QA test-plan implications as documentation by-products.
5. Check the design against every acceptance criterion, then hand the agreed module shape and decisions to build.

## Rules

- Don't design beyond the confirmed requirement or start implementation before the design is clear enough to test.
- If an existing ADR or spec lacks a section its template requires, name the gap, propose content in the template's format and ask. Never fill it silently or skip it.
- Keep ADRs for consequential decisions; don't make routine choices into ceremony.
- Prefer fewer, clearer interfaces and explicit ownership of behavior. Avoid speculative seams and layers.
- Reversible investigation and drafting need no permission. Ask before commit, push, deletion, or outward-facing messages.
