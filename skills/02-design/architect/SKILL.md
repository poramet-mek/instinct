---
name: architect
description: Sketch system topology, data flows, module boundaries, type/interface signatures, and security controls before writing production code. Use for non-trivial features or structural changes.
---
<!-- Inspired by Cursor pstack architect & DietrichGebert/ponytail -->

Before writing production code, design the shape of the change at the boundary level.

## Steps

1. **Decision Ladder (subtract before you add):** Exhaust simpler options in order before writing new code:
   1) Must this exist at all (YAGNI)? 2) Already in this codebase? 3) Standard library? 4) Native platform feature? 5) Already-installed dependency? 6) One-liner? 7) Only then, write minimal new code.
2. **Inspect existing boundaries:** Read the modules, types, and entrypoints this change touches. Reuse existing patterns before inventing new ones.
3. **Sketch the design (brief & concrete):**
   - **Topology & Data Flow:** Where data enters, transforms, persists, and exits.
   - **Module Boundaries & Signatures:** Files/modules to add or change, and their public function/API/type signatures.
   - **Security & Failure Controls:** Auth checks, input validation, idempotency, and error boundaries.
4. **Confirm before building** if the design changes public APIs, schemas, or crosses multiple modules.

## Rules

- Keep it short: signatures and bullets, not prose essays.
- Design deep modules with narrow, simple interfaces rather than many shallow wrappers.
