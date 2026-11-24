---
name: retro
description: Reflect on a completed coding session to capture concrete improvements to repo steering files, living docs, checks, or skills.
disable-model-invocation: true
---
<!-- Inspired by mattpocock/skills retro -->

# Session Retro

Look back at what actually happened in this session—friction, surprises, repeated mistakes, or missing context—and turn it into small, durable improvements for the next session.

## Process

1. **Review the session:** Identify where time was lost, where an agent guessed wrong, where a check caught (or missed) a bug, or where docs/rules were stale.
2. **Propose concrete, minimal fixes** (skip vague advice):
   - **Living Docs:** Missing or stale entries in `ARCHITECTURE.md`, `CONTEXT-MAP.md`, `docs/domain-model.md`, `docs/adr/`, or `docs/concepts/`.
   - **Steering & Rules:** Clarifications for `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, or skill/playbook instructions.
   - **Checks & Tooling:** Missing lint rules, test guards, or scripts that would have caught an issue automatically.
3. **Confirm before editing:** Present a short numbered list of proposed changes (`Target file | Problem observed | Proposed change`) and ask the user which ones to apply.
4. **Apply approved changes** cleanly and verify any affected checks.

## Rules

- Cite real friction from this session—never invent generic best-practice suggestions.
- Prefer deleting or tightening existing instructions over bloating steering files.
- Do not edit files until the user approves the proposed list.
