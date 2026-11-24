---
name: diagnosing-bugs
description: Systematic root-cause diagnosis for bugs, incidents, and regressions. Use when something is broken, throwing, failing, or slow.
---
<!-- Adapted from mattpocock/skills (MIT, Copyright 2026 Matt Pocock) -->

# Diagnosing Bugs

Never guess and patch symptoms. Build a tight feedback loop and prove the root cause first.

## Rules

- **No red loop, no theorising:** Do not read code to build theories or patch anything until you have run a fast, deterministic red-capable command that reproduces the exact symptom. If you cannot build one, stop, list what you tried, and ask the user for access or captured artifacts.
- **Redact secrets:** Replace tokens, keys, and passwords with `<REDACTED>` in all shown commands and outputs.

## Phases

1. **Build a tight red loop:** Create one fast, deterministic command (failing test, curl, script) that goes red on the exact user-reported symptom.
2. **Reproduce & minimise:** Run the loop to watch it fail, then strip away unrelated inputs/steps until every remaining piece is load-bearing.
3. **Hypothesise (3–5 ranked):** Write falsifiable hypotheses (*"If X is the cause, changing Y will make Z happen"*).
4. **Instrument & prove:** Test the top hypothesis with minimal logging or assertions until root cause is proven.
5. **Fix & verify:** Hand off to `tdd` for a regression test + minimal fix, re-run the loop to confirm green, and remove temporary instrumentation.
