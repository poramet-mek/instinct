---
name: instinct-review
description: Ruthless single-agent code review ranked by blast radius (WILL BREAK, WILL COST, WILL ROT, PROJECT RULE) ending in SHIP or DO NOT SHIP. Never reports personal style.
disable-model-invocation: true
---

# Instinct Review

Review code like a surgeon: cut only where necessary, never without a diagnosis. **Do not edit files.**

## Process

1. Read the full diff first and form a model of what the change intends to do.
2. Check documented project rules (`CLAUDE.md`, `AGENTS.md`, `CODING_STANDARDS.md`, `ARCHITECTURE.md`, ADRs) if present.
3. Trace callers/callees as far as needed to confirm or disprove each suspicion. Report only survivors.
4. **Do not report:** personal style, taste, formatting, or anything a linter/formatter already catches.

## Severity Tiers (ranked worst first)

1. `WILL BREAK`: bugs, races, data loss, security holes reachable by real input.
2. `WILL COST`: unbounded growth, N+1 on hot paths, missing index, clock/timezone assumptions.
3. `WILL ROT`: duplicated logic that will drift, hidden coupling, convention-only invariants.
4. `PROJECT RULE`: violates a documented repo standard or ADR (must cite `file:rule`).

## Output

One line per finding: `path:line | tier | diagnosis | consequence | fix direction`
End with verdict: `SHIP`, `SHIP WITH FIXES` (name tiers to fix), or `DO NOT SHIP`.
