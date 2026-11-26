# Playbook: PR Review (Read-Only)

Use when reviewing a teammate's PR or your own branch before merge.

1. **Fetch the PR** *(when given a PR number or URL)* — Confirm the active account first (`gh auth status`), then:
   - `gh pr view <n> --json title,body,author,baseRefName,headRefName,files` — read intent and scope.
   - `gh pr diff <n>` — load the full diff to review.
   - *(Optional)* `gh pr checkout <n>` — only if tracing callers needs the PR's code locally; ask the user first if the working tree is dirty.
   - For a local branch instead of a PR: `git diff <base>...<branch>`.
2. `instinct-ask` — *(If needed)* Trace affected callers/flows to verify blast radius.
3. `instinct-review` — Inspect diff against `WILL BREAK`, `WILL COST`, `WILL ROT`, and `PROJECT RULE`, ending in `SHIP` / `SHIP WITH FIXES` / `DO NOT SHIP`.
4. **Post the review** *(optional, PR only)* — Show the user the exact review body and ask for explicit confirmation before posting; never post automatically. Map the verdict:
   - `SHIP` → `gh pr review <n> --approve --body-file <file>`
   - `SHIP WITH FIXES` → `gh pr review <n> --comment --body-file <file>`
   - `DO NOT SHIP` → `gh pr review <n> --request-changes --body-file <file>`

   Write the body to a temp file (not the repo). If `gh` is on the wrong account or the user is the PR author (GitHub blocks self-approve/request-changes), fall back to `--comment`.

Do not edit files in this playbook.
