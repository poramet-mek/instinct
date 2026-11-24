---
type: avoid
tags: [lint, parsing]
seen: 1
projects: [instinct]
---

Keep raw source inputs separate from lint warnings, and recognize comment delimiters only in valid comment positions.

**Why:** Raw rows leaked into output as undefined warnings, while delimiter-like text inside a string created a false doc block.

**How to apply:** Accumulate added and untracked rows separately, return only diagnostics with messages, and gate block openers and closers by trimmed-line and current block state.
