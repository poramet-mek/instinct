# Playbook: Security & Race Fix

Use when hunting or fixing vulnerabilities, auth flaws, or API race conditions on local/staging.

1. `instinct-pentest` — Run adversarial tests (race bursts, IDOR, injection, rate limits) and log findings.
2. `tdd` — Write regression/concurrency tests and minimal fix.
3. `instinct-pentest` — Re-run attacks to confirm fixes and update Pentest Report under `docs/security/`.
4. `instinct-review` — Verify `WILL BREAK` / security posture.
5. `git-workflow` — Clean commit and PR.
