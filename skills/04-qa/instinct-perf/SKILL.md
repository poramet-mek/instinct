---
name: instinct-perf
description: Performance, load, and concurrency benchmarking with strict baseline-vs-after evidence. Use before optimizing or validating SLA targets.
disable-model-invocation: true
---
<!-- Inspired by Cursor pstack benchmark-checklist -->

# Instinct Perf

Never claim an optimization works or a system meets SLA without measured before/after numbers.

## Steps

1. **Define SLA Targets:** Set concrete thresholds first (p95/p99 latency, throughput RPS, memory/CPU ceiling, error rate).
2. **Measure Baseline:** Run the benchmark against the unchanged code on realistic data/payloads and record exact numbers.
3. **Run Load / Burst Tests:** Test sustained load and concurrent bursts (e.g., parallel API calls) to expose deadlocks, pool exhaustion, or N+1 queries.
4. **Optimize & Re-measure:** After code changes (`tdd`), re-run the exact same benchmark command under identical conditions.
5. **Report Evidence:** Present a `Metric | SLA | Baseline | After | Delta` table with the exact benchmark command and environment notes.
