# Playbook: UI Figma

Use for UI-focused tasks driven by Figma designs.

1. `git-workflow` — Branch `feat/<name>` from `develop`.
2. `instinct-flow` — **Mode A (Draft):** *(If multi-screen or has branch/error paths)* write the flow and get owner approval before building.
3. `instinct-figma` — **Mode A (Implement):** fetch one Frame/Component Node ID at a time and build UI + every state in the flow.
4. `instinct-figma` — **Mode B (Visual Parity):** compare live UI screenshot against Figma and fix discrepancies.
5. `instinct-flow` — **Mode B (Conformance):** *(If a flow exists)* confirm every flow edge is implemented.
6. `verify` — Run UI/component tests and interactive checks.
7. `unslop` — Clean diff and comments.
8. `instinct-review` — Review diff before PR.
