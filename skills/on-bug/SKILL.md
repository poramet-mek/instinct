---
name: instinct-on-bug
description: Investigate and fix reported defects by building a feedback loop before theorising. Use on your own when behavior is wrong, failing, throwing or slow, including "debug this", "this is broken", "fix the bug", "ช่วยหา bug", "มัน fail".
---

# On bug

Start from the user's exact symptom. The first job is a reliable signal that reproduces it; code-reading theories come later.

## Steps

1. Capture the expected and observed behavior, inputs, environment, and source link (issue, report, or conversation). Read relevant context and ADRs.
2. Build the tightest practical feedback loop: preferably a regression test at the real seam; otherwise a script, command, trace replay, or harness. Run it and verify it can show the reported failure.
3. If no loop exists, keep investigating ways to make one. If blocked by missing access or evidence, tell the user what is needed; don't present a guess as diagnosis.
4. Minimise the failing case and preserve its output. Then form ranked, falsifiable hypotheses and test them one at a time.
5. Add or refine the regression test, observe it fail, apply the smallest fix, and observe it pass. Re-run the original feedback loop and relevant broader checks.
6. Remove temporary instrumentation. Report the cause, fix, evidence, and any limitation; link the report/source.

## Rules

- Feedback loop before theorising. A nearby failure is not proof of the reported bug.
- Keep reproduction deterministic and specific to the user's symptom; redact secrets from logs and artifacts.
- Don't hide missing reproduction or skipped verification. Ask for required environment access or redacted evidence when needed.
- Reversible investigation and fixes are authorized. Ask before commit, push, deletion, or outward-facing messages.
