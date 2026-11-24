---
name: instinct-qa-doc
description: Draft E2E test cases (including failure-mode/resilience), run E2E tests with screenshot/evidence capture into docs, and generate UAT documents.
disable-model-invocation: true
---

# Instinct QA & UAT Docs

Three modes for end-to-end quality assurance and stakeholder sign-off.

## Modes

1. **Draft E2E Test Cases:** Produce a structured test suite (`ID | Scenario | Preconditions | Steps | Expected Result | Type`). Must cover:
   - **Happy Paths:** Core user journeys end-to-end.
   - **Failure-Mode & Resilience:** Network drop mid-request, API timeout/500, rapid double-click / duplicate submit, token expiry, crash & recovery.
2. **Run E2E & Capture to Document:** Execute E2E flows (via Playwright/ADB MCP or test runner), capture actual pass/fail output and screenshots, and embed/link them as evidence per test case.
3. **Generate UAT Document:** Compile business-readable UAT scenarios mapped to acceptance criteria, with Test Data, Expected Outcome, Actual Result, Evidence link, and Sign-off table (`Tester | Role | Date | Pass/Fail | Signature`).

## Output & Rules

- Save documents under `docs/qa/` (e.g., `docs/qa/e2e-<feature>.md`, `docs/qa/uat-<feature>.md`) unless the repo uses another convention.
- Never mark a test case `PASS` without observed execution evidence.
- Redact any tokens, passwords, or PII from captured logs and screenshots.
