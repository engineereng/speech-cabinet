---
name: speech-cabinet-feature-workflow
description: >-
  End-to-end feature workflow for the speech-cabinet repo: plan, git worktree on
  a branch, implement, manual or Playwright testing, Vercel Preview render
  regression, and GitHub PR to main via gh—without merging into local main.
  Use when starting or shipping a feature, opening a PR, or when the user
  mentions worktrees, Preview regression, or the numbered steps below.
---

# Speech Cabinet feature workflow

Follow these steps in order unless the user explicitly skips one.

## 1. Plan

- Agree scope and approach (issue link, UI/data boundaries).
- Do **not** edit the plan file after the user freezes it unless they ask for plan iteration.

## 2. Worktree + branch

- **Never merge features into local `main` without explicit user instruction** (see project rule `git-main-workflow`).
- From the main clone (e.g. `speech-cabinet`):

  ```bash
  cd /path/to/speech-cabinet
  git fetch <fork-remote> <base-branch>
  git worktree add ../speech-cabinet-<short-name> -b feature/<issue-or-topic> <fork-remote>/<base-branch>
  ```

- Do implementation work in that worktree directory so `main` stays clean and the branch is isolated.

## 3. Implement

- Commit on the feature branch in the worktree.
- Prefer the worktree path when the user says they are on a worktree branch.

## 4. Manual testing (or Playwright)

- **Local:** `yarn` then `yarn dev` in the worktree; use a **hard refresh** or private window if Server Action hash errors appear after switching branches.
- **Worker (renders):** second terminal: `yarn dev:work` (same `.env` / `DATABASE_URL`; Postgres must be reachable). See [README.md](../../README.md) Development section.
- **Optional:** Playwright MCP or repo e2e tests for repeatable checks.

## 5. Vercel Preview render regression

- **Push** the feature branch to the fork so Vercel creates a **Preview** deployment.
- **Render path:** the Next app enqueues jobs via pg-boss (`DATABASE_URL`). A **separate** Node worker (`yarn dev:work` / production worker) must consume the **same** database as Preview, or renders will stall.
- On the Preview URL, smoke-test at least:
  - Editor and in-app player for the feature.
  - **Render video** (and optionally GIF) so the worker-built output matches expectations.

## 6. PR with `gh` (base almost always `main`)

- From a clone that has the pushed branch:

  ```bash
  gh pr create --base main --head <owner>:feature/<branch-name> \
    --title "feat: … (#<issue>)" \
    --body "…summary…\n\n## Test plan\n- [ ] …"
  ```

- Merge via **GitHub** after review; do not `git merge` into local `main` unless the user asks.

## 7. Cleanup (optional)

- `git worktree remove ../speech-cabinet-<short-name>` after the branch is merged or abandoned.

## Repo pointers

- App: Next.js App Router; editor [`src/app/page.tsx`](../../src/app/page.tsx).
- Renders: [`src/server/server-actions.ts`](../../src/server/server-actions.ts), [`src/server/queue.ts`](../../src/server/queue.ts), worker [`src/worker/worker.ts`](../../src/worker/worker.ts).
