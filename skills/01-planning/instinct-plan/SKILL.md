---
name: instinct-plan
description: Record confirmed requirements, scope, non-goals, security/regulatory constraints, task breakdown, and time estimates. Use after requirements are clear and before design/build.
disable-model-invocation: true
---

# Instinct Plan

Turn a settled requirement or BRD into a crisp, actionable implementation plan.

## Output Sections

1. **Requirement Record:** Problem statement, target users, and numbered acceptance criteria (verifiable, no vague adjectives).
2. **Scope & Non-Goals:** Explicitly list what is *in* and what is *out* to prevent scope creep.
3. **Constraints:** Security, privacy/regulatory, hardware/offline, and performance/SLA requirements.
4. **Task Breakdown & Estimate:**
   - Break work into small vertical slices (Design, Build + Unit Test, E2E/QA, Release).
   - Estimate effort per slice (optimistic / realistic) and call out dependencies and blockers.
5. **Assumptions & Risks:** List any open assumptions and mitigation steps.

## Rules

- Do not invent missing requirements; ask or flag them as open questions.
- Keep estimates honest: include testing, review, and QA/UAT doc time, not just coding time.
