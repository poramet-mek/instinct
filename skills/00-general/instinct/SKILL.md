---
name: instinct
description: Master SDLC orchestrator. Matches your goal to one playbook, builds a step-by-step checklist, and runs the right atomic skills in order.
disable-model-invocation: true
---

# Instinct Orchestrator

Match the request to **one** playbook below, read **only** that playbook file (`playbooks/<name>.md`), present the checklist, and execute step-by-step.

## Playbook Routing

| Goal | Playbook |
|---|---|
| New product, business model, BRD, project setup | `playbooks/new-product.md` |
| Explore unfamiliar repo, feasibility & estimate | `playbooks/explore.md` |
| New feature (medium/large) | `playbooks/feature.md` |
| UI implementation or parity from Figma | `playbooks/ui-figma.md` |
| Standard bug fix on `develop` | `playbooks/bug-fix.md` |
| Urgent production hotfix on `main` | `playbooks/hotfix.md` |
| Refactor without behavior change | `playbooks/refactor.md` |
| Performance / latency / load optimization | `playbooks/perf-fix.md` |
| Security / race-condition fix | `playbooks/security-fix.md` |
| Review a PR or branch (read-only) | `playbooks/pr-review.md` |
| QA, E2E/UAT, perf, pentest, and release | `playbooks/qa-release.md` |
| Small 1-file fix or trivial edit | `playbooks/quick.md` |

## Rules

- Read only the single matched playbook—never load all playbooks.
- Ask once if the goal is ambiguous between two playbooks (e.g., `quick` vs `feature`).
