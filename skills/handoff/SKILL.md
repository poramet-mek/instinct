---
name: instinct-handoff
description: Write a hand-off so another session or agent (Claude, Codex, agy) can continue the work, or take a pending one. Use on your own when switching agent, switching directory, handing to a colleague, or when the user says "ส่งต่องาน", "handoff", "ทำต่อ". When staying in the same session and directory, prefer compact.
---

# handoff

Write a hand-off so another session or agent (Claude, Codex, agy) can continue the work.
Use it ONLY when switching agent, switching directory, handing to a colleague, or when the user asks;
when staying in the same place, a compact is better.

CLI: `node <instinct>/bin/instinct.js`, where `<instinct>` is the repo that holds this skill
(this file is `<instinct>/skills/handoff/SKILL.md`; resolve the symlink).
Run it from the project directory.

## Steps

### 1. Writing a hand-off
- **Check existing.** Run `instinct handoff`. If a pending handoff already exists, ask the user before overwriting.
- **Write file.** Create `.instinct/handoff.md` in the project root with frontmatter:
  ```markdown
  ---
  title: <short, one line>
  from: <agent name>
  at: <ISO time, e.g. 2026-11-23T09:00:00Z>
  ---
  ```
  Followed by sections:
  - `## Goal and acceptance criteria` (include source link)
  - `## State` (what is done, commits)
  - `## Risk tier and AI review results`
  - `## Next steps`
  - `## Open doubts`
  - `## Delegated work in flight`

### 2. Taking a hand-off
- **Notice on session start.** A new session's SessionStart hook shows only ONE line saying a pending hand-off exists (`title`, `from`, age); it is hidden after 7 days.
- **Decide.** Read the file only if the user says continue / "ทำต่อ" or their first request clearly matches that work; otherwise ignore it and do not ask.
- **Take and archive.** Run `node <instinct>/bin/instinct.js handoff take` (or `instinct handoff take`), which prints the hand-off and archives it to `.instinct/handoffs/<time>.md` so no later session is told again.
- **Check status.** `instinct handoff` with no args shows the pending status.

## Rules

- Never put secrets, API keys, or credentials in a hand-off.
- Never overwrite an existing pending hand-off without asking the user first.
- Do not proactively ask the user about a pending hand-off if their request is unrelated.
- When staying in the same session and directory, do not create a hand-off; use compact instead.
