# instinct — spec

Status: agreed 2026-11-23 (design interview). Build order in §9.

## Goal

Cut the bottlenecks between requirement and production. Coding is no longer the slow part;
**review, design and documentation** are. Claude leads a team of agents (Claude, Codex,
Antigravity/Gemini), learns from what worked and what failed, and acts on its own when
something should be done instead of suggesting the user run a skill.

## 1. Structure and install

- This repo is the source. `reference/mattpocock-skills/` is a read-only copy of
  mattpocock/skills (MIT) for inspiration. Text taken from it keeps the MIT credit.
- Works for every agent: knowledge is plain Markdown any agent can read.
- Hooks: one **Node.js** core holds the logic. A thin adapter per agent translates its hook
  JSON in and out (Claude `settings.json`, Codex `~/.codex/hooks.json`, agy `.agents/hooks.json`).
  Events an agent lacks (agy has no PreCompact/SessionEnd, no true UserPromptSubmit) are
  skipped; that work moves to `Stop`.
- Install: skills and lessons are symlinked; hook config is **merged** into each agent's
  existing config by an installer, never overwritten.
- Per-project config `.instinct/config.yml`: PR platform and access (`cli: gh|glab` or
  `mcp: <server>`), plus links (tracker, Figma, CI). No secrets. If missing, the agent detects
  what it can (git remote) and drafts the file for the user to confirm.
- Replaces the mattpocock-skills plugin in the long run.

## 2. Autonomy

- Reversible work (read, review, run/write tests, record lessons): do it without asking.
- Hard-to-reverse or outward-facing work (commit, push, delete, send messages): ask first.
- **Requirement gate:** no code before testable acceptance criteria the user confirmed.
  Requirements come from any source (tracker, docs, chat, prompt); keep a link to the source.
  Small work: 2–3 criteria. Large work: full grilling.

## 3. Lessons

- Two tiers: general lessons in this repo; project lessons in `<project>/.instinct/lessons/`.
- One file per lesson, frontmatter `type: do|avoid`, `trigger`, `tags`, `seen`; body is the
  rule, **Why**, **How to apply**. Each tier has an index.
- Record when: the user corrects the agent; the agent catches its own mistake (test fails after
  "done", retracted answer); something worked and the user confirmed it. Retro only for large work.
- Loading: index at session start; hooks inject the lessons whose `trigger`/`tags` match the
  moment (e.g. before `git commit`, after editing `.dart`).
- Promotion project → general is automatic when the same lesson appears in **2+ projects**,
  written to a promotion log the user can review and revert.

## 4. Review pipeline

- Every change gets a risk tier, and the AI reviewers follow it:
  - 🟢 rename or docs: self-review only.
  - 🟡 ordinary logic: `surgeon-reviewer`.
  - 🔴 money, auth or data: `surgeon-reviewer` plus an agent from another vendor.
- Small, single-topic PRs. Evidence instead of reading: red-then-green tests, screenshots, logs.
- PR template: risk tier · acceptance-criteria checklist · evidence · where to look (file:line)
  · AI reviewer results · open doubts. QA test plan and release notes only on release PRs.
- The user is the final reviewer. Platform-agnostic (see §1 config).

## 5. Documentation

One source (acceptance criteria + ADRs) generates per-audience docs. Docs are a by-product of
the work, not a later task.

| Audience | Docs generated |
|---|---|
| Team and agents | ADR, `CONTEXT.md` |
| QA | Test plan |
| Stakeholders | Release notes |

## 6. Agent team (Claude leads)

- Claude always shows its delegation plan. It proceeds at once when the plan is within the
  criteria, such as independent parts or 🔴 cross-vendor review. Outside the criteria, it
  waits for the user.
- Dispatch adapter: Herdr (`hc`) primary; headless CLI (e.g. `codex exec`) fallback.
- Score each finished task on four criteria. Time and quota are logged but not scored.
  - Correctness: passed tests and review, no rework.
  - Stayed in scope.
  - Number of rework rounds.
  - Honest reporting.
- Scores are kept per agent × task type, with links to the evidence, in the general tier.
- Cold start: the static routing table in `~/.agents/instinct.md`. Scores take over for a task
  type once it has **5+ scored tasks**. The user can edit any score, and the user's edit
  outweighs Claude's.

## 7. Skills (v1, adjust by use)

Named by situation, not command.

| Phase | Skill | Does |
|---|---|---|
| Ask | `on-ask` | Answer a question or route to the right skill; read-only |
| Requirement | `on-requirement` | Any source → acceptance criteria → user confirms (gate) |
| Design | `on-design` | ADRs, module shape, grilling for large work |
| Delegate | `on-delegate` | Split work, pick agents by score, score results |
| Build/test | `on-build` | TDD, attach evidence |
| Bug | `on-bug` | Feedback loop before theorising |
| Review | `before-pr` | Risk tier, AI review, PR template |
| Docs | `on-release` | Per-audience docs from the single source |
| Upkeep | `on-upkeep` | Survey codebase friction, ranked refactor candidates; read-only |
| Learning | `after-mistake`, `on-success` | Record lessons, promote |

User-invoked tools: `merge-conflicts`, `wizard`.

## 8. Measuring

Per-PR log: user review time, rework rounds, issues the user caught that AI reviewers missed
(that last one feeds back into lessons).

## 9. Build order

1. MVP 1: lessons + Node hook core with adapters.
2. MVP 2: review pipeline (`before-pr`).
3. Delegation + scoring.
4. Remaining skills.
