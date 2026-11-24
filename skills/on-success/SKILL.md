---
name: instinct-on-success
description: Record what worked so it is repeated. Use on your own, without being asked, when the user confirms a non-obvious approach worked ("ดีมาก", "แบบนี้แหละ", "ใช่ ทำแบบนี้ต่อ", "perfect, keep doing that"), when a PR passes the user's review with no rework, or at the end of large work (a short retro).
---

# on-success

Corrections are easy to notice; confirmations are quiet. Record a success only when it is
**non-obvious** and the user **confirmed** it, so lessons stay few and worth reading.

CLI: `node <instinct>/bin/instinct.js`, where `<instinct>` is the repo that holds this skill
(resolve the symlink). Run it from the project directory.

## Steps

1. **Is it worth a lesson?** Yes if a future session could easily do it differently and be
   worse: a choice between options, a way of working the user prefers, a fix that took effort
   to find. No if it is the default behaviour anyway.

2. **Record it** as a `do` lesson, same tiers and id rules as `instinct-after-mistake`:
   ```
   instinct record --tier project|general --id <kebab-id> --type do \
     --rule "<one sentence>" --why "<why it worked / what the user said>" \
     --how "<when and how to repeat it>" --tags a,b [--trigger '<json>']
   ```
   Same id again bumps `seen`; a lesson seen in 2+ projects is promoted to general on its own.

3. **After a PR review** (see `instinct-before-pr` step 8): log the PR with `instinct pr-log`.
   For delegated work, the scores belong to `instinct-on-delegate` step 6.

4. **Retro for large work only** (several PRs, or more than a day): list at most 3 things to
   repeat and 3 to avoid; record each as a lesson (steps above). Skip the retro for small work.

5. **Review promotions now and then.** `instinct promote` lists automatic promotions. If one
   is too project-specific to be general, undo it with `instinct promote --revert <id>`
   (after asking the user, since it changes their shared lessons).

## Rules

- Tell the user in one line which lesson you recorded.
- Do not record praise itself; record the behaviour that earned it.
