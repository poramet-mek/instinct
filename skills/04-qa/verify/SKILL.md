---
name: verify
description: Prove changes work with real command output before claiming done. Covers unit, integration, and key failure/edge paths.
---
<!-- Inspired by Cursor pstack show-me-your-work -->

# Verify

Never claim a task, fix, or test passes without running it after your final edit and observing the output.

## Rules

1. **Run the real checks:** Execute focused tests, full test suite, typecheck, and build/lint relevant to the change.
2. **Test failure paths too:** Do not stop at the happy path; verify key error, boundary, and edge-case behaviors.
3. **Show real evidence:** Report the exact commands run and their actual pass/fail/skip counts and output.
4. **Report blocks honestly:** If a check could not run or failed, state it plainly with the reason—never mark a criterion met without evidence.
5. **Clean up test data:** Remove any temporary records, files, or processes created for verification.
