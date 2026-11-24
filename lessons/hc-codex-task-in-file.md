---
type: do
tags: [hc, codex, delegate]
seen: 1
projects: [app-a]
---

When starting Codex through hc on Windows, put the task in a file and pass a one-line prompt that tells Codex to read it.

**Why:** codex.cmd is a batch file and hc refuses an argument with a line break; the file route worked first time (2026-11-23).

**How to apply:** Write the task to .scratch/<feature>/<name>-task.md, run hc run ... codex.cmd --no-daemon '<read that file and do it; report with hc send <lead-id>>', delete the file when done.
