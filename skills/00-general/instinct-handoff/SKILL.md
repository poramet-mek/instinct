---
name: instinct-handoff
description: Package current session state into a git-grounded HANDOFF.md (or copyable prompt) for a fresh session or another agent, or resume from an existing HANDOFF.md with drift check.
disable-model-invocation: true
---

# Instinct Handoff

Transfer context cleanly across sessions or agents without relying on chat memory.

## Modes

- **Write (default):** Inspect real git state first (`git branch --show-current`, `git status --short`, `git log -n 5 --oneline`). Write `HANDOFF.md` at repo root (or output inline if asked not to write a file) with:
  1. **Goal:** What we are trying to finish.
  2. **Git State:** Branch, HEAD commit, and uncommitted/modified files.
  3. **Done:** Completed work and verified checks/commands.
  4. **Failed Approaches / Dead Ends:** What was tried and failed (so the next agent does not repeat it).
  5. **Decisions & Constraints:** Key choices or guardrails to respect.
  6. **Next Steps:** Concrete files, commands, and acceptance checks to run next.
- **Resume (when asked to resume/pick up):** Read `HANDOFF.md`, compare against current `git status` and `git log`, flag any drift since the handoff, confirm the next step, and continue.

## Rules

- Verify every file path, commit, and test status against real git/files—never guess from memory.
- Keep `HANDOFF.md` concise (~30–50 lines) and remind the user to remove it (or keep it untracked) once the task finishes.
