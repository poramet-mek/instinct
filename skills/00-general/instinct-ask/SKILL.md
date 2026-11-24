---
name: instinct-ask
description: Read-only codebase Q&A: full repo inventory (screens, features, DB tables, config) or token-efficient single-feature flow trace with file:line citations.
disable-model-invocation: true
---

# Instinct Ask (Read-Only)

Answer questions strictly from the actual codebase. Never edit files or run state-changing commands.

## Rules

1. **Read before claiming.** Inspect real files first. Never guess symbol names, counts, or file paths.
2. **Cite every claim.** Include `file:line` references for functions, routes, tables, and config.
3. **Mark inferences.** Label anything inferred rather than directly observed.
4. **Stay concise.** Use bullets, tables, or a short ASCII/mermaid diagram. Skip filler.
5. **Check project docs when relevant.** For questions about architecture, future plans, standards, QA, security, or releases, check `ARCHITECTURE.md`, `CODING_STANDARDS.md`, and `docs/` (`concepts/`, `adr/`, `qa/`, `security/`, `releases/`) if present.

## Modes

- **Full Repo Inventory** *(when asked for an overview of an unfamiliar project)*:
  Summarize: Tech stack, **screens/routes count**, **feature list**, **database engine + table count/names**, **config/env structure**, and **project docs** (`ARCHITECTURE.md`, `CODING_STANDARDS.md`, `docs/concepts/`, `docs/adr/`, `docs/qa/`, `docs/security/`, `docs/releases/`)—all cited with real files.
- **Single-Feature Flow** *(default for targeted questions, token-efficient)*:
  Inspect ONLY files relevant to that feature. Trace actual execution end-to-end (UI/Route -> Handler/Controller -> Service -> DB/External) with `file:line`.
- **Impact / File Map:**
  List involved files, what each owns, and callers/dependents affected by a change.
