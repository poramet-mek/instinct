---
type: do
tags: [review, security, delegate]
seen: 1
projects: [app-a]
---

For code that handles a password or other secret, get a review from a different vendor's agent even after surgeon-reviewer passes it.

**Why:** In a mobile app ticket, Codex found a secure-store error kept as the failure cause (and logged) that two surgeon-reviewer passes missed; the user accepted the flow.

**How to apply:** After surgeon-reviewer, send a read-only review task to the other vendor focused on secret paths (logs, causes, toString, files) and partial-failure cleanup; fix and get its SHIP before commit.
