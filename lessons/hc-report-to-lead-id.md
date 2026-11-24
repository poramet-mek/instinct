---
type: avoid
trigger:
  - event: pre-tool
    command: "hc run*"
tags: [hc, delegate]
seen: 1
projects: [instinct]
---

When delegating via hc, write your own terminal id literally in the report instruction (hc send t2h ...), never $HC_TERMINAL_ID.

**Why:** Inside the helper $HC_TERMINAL_ID is the helper's own terminal, so Codex typed its report into its own prompt and the lead never got it (2026-11-23).

**How to apply:** Before hc run, read your $HC_TERMINAL_ID and put the literal id in the task text.
