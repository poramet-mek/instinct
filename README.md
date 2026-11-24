# instinct v2.0.0

Lean, modular SDLC atomic skills for AI coding agents (Claude Code, Codex, Antigravity, Gemini CLI).

Zero hooks. Zero session-start bloat. Each skill is concise (~25–40 lines), self-contained, and loaded on demand—with user-only skills (`disable-model-invocation: true`) consuming **0 tokens** during normal coding.

## Credits
Portions adapted from or inspired by:
- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © 2026 Matt Pocock)
- [Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack) (by Lauren Tan / `@poteto`)

## 22 Skills Across 6 Core Phases (1 Orchestrator + 21 Atomic Skills)

| Phase | Skill | Mode | Purpose |
|---|---|---|---|
| `00-general` | `instinct` | User-only | Orchestrator: matches goal to 1 of 12 playbooks |
| `00-general` | `instinct-ask` | User-only | Read-only repo inventory or single-feature flow trace |
| `00-general` | `instinct-handoff` | User-only | Git-grounded session handoff (`HANDOFF.md`) & drift-checked resume |
| `00-general` | `retro` | User-only | Post-session retrospective to improve living docs, steering files, and checks |
| `01-planning` | `instinct-business` | User-only | Product strategy, commercial packaging, market benchmark, BRD |
| `01-planning` | `grilling` | On-demand | Design-tree interview to clarify requirements & decisions |
| `01-planning` | `instinct-concept` | User-only | Capture future concepts, RFCs, POC guardrails (`docs/concepts/`) |
| `01-planning` | `instinct-plan` | User-only | Requirement record, scope/non-goals, task breakdown, estimates |
| `02-design` | `instinct-standards` | User-only | `ARCHITECTURE.md`, `CODING_STANDARDS.md`, folder layout, ADRs |
| `02-design` | `architect` | On-demand | Topology, data flow, module boundaries, security controls |
| `02-design` | `instinct-figma` | User-only | Figma MCP (1 frame/node at a time) & visual parity checks |
| `03-build` | `tdd` | On-demand | Red → minimal green → refactor in vertical slices |
| `03-build` | `git-workflow` | On-demand | GitFlow (`main`, `develop`, `feat/*`, `release/*`, `hotfix/*`) |
| `03-build` | `unslop` | On-demand | Diff cleanup, remove AI tells, concise code comment rules |
| `03-build` | `instinct-review` | User-only | Ruthless review (`WILL BREAK/COST/ROT`, `PROJECT RULE`) → `SHIP` |
| `04-qa` | `verify` | On-demand | Prove work with real command output & failure-path checks |
| `04-qa` | `instinct-qa-doc` | User-only | E2E drafts (incl. resilience), capture evidence, UAT docs |
| `04-qa` | `instinct-perf` | User-only | SLA targets, baseline vs after benchmarks, burst tests |
| `04-qa` | `instinct-pentest` | User-only | Authorized local/staging security & race-condition report |
| `05-deploy` | `instinct-manual` | User-only | Screenshot-backed `user-manual-for-<slug>.md` with discovery, troubleshooting & target review |
| `05-deploy` | `release` | User-only | GitFlow release, SemVer, `CHANGELOG.md`, Change Committee doc |
| `06-ops` | `diagnosing-bugs` | On-demand | Tight red feedback loop → root cause → regression test |

## Usage (Node >= 20, zero dependencies)

```sh
node bin/instinct.js list
node bin/instinct.js install                                  # dry run
node bin/instinct.js install --apply                          # all agents
node bin/instinct.js install --apply --target claude,codex    # selected agents
node bin/instinct.js uninstall --apply                        # removes only instinct skills
npm test
```
