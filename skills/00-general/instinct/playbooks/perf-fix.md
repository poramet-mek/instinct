# Playbook: Performance Fix

Use when optimizing latency, throughput, memory, or concurrency bottlenecks.

1. `instinct-perf` — Define SLA targets and measure Baseline first.
2. `diagnosing-bugs` — Profile/isolate the exact bottleneck with a tight loop.
3. `tdd` — Implement optimization behind behavior-preserving tests.
4. `instinct-perf` — Re-run identical benchmark and report Before vs After delta.
5. `unslop` — Clean diff and comments.
6. `instinct-review` — Verify no `WILL BREAK` / concurrency regressions.
