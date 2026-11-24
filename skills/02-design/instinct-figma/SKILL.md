---
name: instinct-figma
description: Implement UI from Figma MCP or run a Visual Parity check comparing live UI against Figma. Use when working with Figma links, frames, or UI design tokens.
disable-model-invocation: true
---

# Instinct Figma

Bridge Figma designs and production UI using the Figma MCP without blowing up context.

## Critical Rule

- **Fetch one Frame or Component Node ID at a time.** Never dump an entire Figma file or page. Ask for the specific node/frame URL if not given.

## Modes

### A. Implement from Figma
1. Fetch the target frame/component node via Figma MCP.
2. Extract design tokens (colors, typography, spacing, radii) and map them to the repo's existing theme/design system first.
3. Implement layout, responsive behavior, and interactive states (loading, empty, error, disabled).

### B. Visual Parity Check
1. Fetch the target Figma frame and capture a screenshot of the live UI (via Playwright/ADB MCP or user screenshot).
2. Compare layout, spacing, typography, colors, alignment, and states.
3. List concrete discrepancies (`element | expected (Figma) | actual | fix`) and apply fixes.
