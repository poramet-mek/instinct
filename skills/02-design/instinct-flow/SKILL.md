---
name: instinct-flow
description: Draft an owner-approved UX flow spec (Mermaid + traceability table) before Figma or code, or check that every flow edge exists in the app. Use for multi-screen UI work with branches, errors, or cancel paths.
disable-model-invocation: true
---

# Instinct Flow

One flow file is the single source for "which screen leads where, when, and what happens on failure". Figma draws it, code implements it, QA tests it.

## Critical Rule

- **Never guess a path.** Unknown screen, condition, error code, or setting is written as `TBD` and listed under Open Questions.

## Modes

### A. Draft Flow
1. Read the requirement/spec, `docs/specs/` screen maps, domain rules, and existing routes for the item.
2. Write `docs/specs/flows/<ID>-<slug>.md` (unless the repo uses another convention):
   - Header: `Status: draft | approved (<owner>, <YYYY-MM-DD>)`, scope, entry and exit points.
   - One Mermaid `flowchart` with stable node IDs. Label every edge with its trigger or condition.
   - Cover happy path, every error/reject path, cancel/back, timeout, and retry.
   - Traceability table, one row per node: `Node | Figma node id | Route | Usecase / Error code | Setting / Flag`.
   - Open Questions: every `TBD` with who must answer it.
3. Flag nodes with no Figma frame as design gaps; do not invent screens.
4. Hand to the owner for approval. Only an `approved` flow may drive Figma or code.

### B. Conformance Check
1. Read the approved flow file and list every edge (`from -> to | trigger`).
2. Trace each edge in code (route, navigation call, error handler) and tests.
3. Report `edge | status (implemented / missing / differs) | path:line | fix`. Missing or differing edges are findings, not style.

## Sharing

- GitHub and VS Code render Mermaid directly; agents read the text and diff it in git.
- For stakeholders who need a file: `npx @mermaid-js/mermaid-cli -i <flow>.md -o <flow>.pdf` (or `.png`).
