# Fork runbook: Vercel Preview (engineereng)

**Fork-only.** Use this on **engineereng/speech-cabinet** (or a clone where Preview builds trigger from your fork). Upstream `tm-a-t/speech-cabinet` may not include this directory or the Vercel-only code paths—keep fork-specific PRs separate when contributing back.

**Deep reference:** [Hosting: Vercel previews + worker](../hosting-vercel-and-worker.md) (Neon URLs, Deployment Protection / `withBypass`, Blob uploads, P3009 / migrations, troubleshooting, status log from issue #18).

---

## Why a dedicated branch (not only `fix/18-rendering-stuck`)

`fix/18-rendering-stuck` is a **named feature branch**. For day-to-day Preview testing, use a **long-lived fork branch** so history and Vercel URLs stay predictable—for example:

| Approach | How |
| -------- | --- |
| **New long-lived branch** | From current Vercel-capable tip (e.g. `fix/18-rendering-stuck`): `git switch -c collin/vercel-preview` → push to `fork`. Use this for ongoing Preview work; merge or rebase `main` / upstream when you need their changes. |
| **Keep using `fix/18-rendering-stuck`** | Fine until you delete it; rename mentally to “Vercel stack branch” or replace with `collin/vercel-preview` when convenient. |

Vercel builds whatever Git branch you push to the **connected repo** (your flow: `git push fork <branch>`). Preview hostname shape: `https://speech-cabinet-git-<branch-slug>-collin-engs-projects.vercel.app`.

---

## Code that must ship together for “full” Preview + worker

These pieces are coupled; cherry-picking one file in isolation usually breaks builds or renders. (See `git diff main...fix/18-rendering-stuck` for the authoritative set.)

- **Build / platform:** [vercel.json](../../vercel.json), [scripts/vercel-build.mjs](../../scripts/vercel-build.mjs), `package.json` script `vercel-build` + deps (e.g. `@vercel/blob`).
- **Database:** [prisma/schema.prisma](../../prisma/schema.prisma) — `binaryTargets` for Vercel Linux/ARM, `directUrl` → `DATABASE_URL_UNPOOLED`; migrations under `prisma/migrations/`.
- **Worker + assets:** [src/worker/worker.ts](../../src/worker/worker.ts) — `withBypass()` for Deployment Protection, Blob `put()` for artifacts, `WEB_URL` fetch of `/render` + music.
- **API:** `src/app/api/video/[id]/route.ts`, `src/app/api/gif/[id]/route.ts` — proxy Blob URLs when present.
- **Optional helpers:** [scripts/push-preview-db-env.mjs](../../scripts/push-preview-db-env.mjs), `.env.example` / `src/env.js` for documented vars.

If your goal is “Preview matches production worker behavior,” keep this set on **one** fork branch and merge upstream in bulk rather than half-porting to `main` on the fork without the rest.

---

## Checklist: green Preview + successful render

Do these in order; skip worker steps if you only need the static app.

### 1. Push to the fork

```bash
git push -u fork <your-branch>
```

Confirm a **READY** deployment in [Vercel](https://vercel.com) → team **collin-engs-projects** → **speech-cabinet** → Deployments.

### 2. Vercel → Environment variables (Preview)

Project **speech-cabinet** → **Settings** → **Environment Variables** → scope **Preview** (add Production only if you mean to).

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Pooled Postgres (e.g. Neon pooler host). App + pg-boss at runtime. |
| `DATABASE_URL_UNPOOLED` | Direct Neon host (same DB). Required for `prisma migrate deploy` in build. |
| `NEXTAUTH_SECRET` | Required in production worker path; set for Preview to match worker. |
| `BLOB_READ_WRITE_TOKEN` | Worker uploads mp4/gif to Vercel Blob; create store / pull token (`vercel env pull`). |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | If **Deployment Protection** is on for Previews: worker Puppeteer must bypass (see `withBypass` in worker). Often auto on Vercel; worker still needs the same value in **its** env. |

Then **Redeploy** the latest Preview (env changes do not apply to old deployment artifacts until redeploy).

**Build log:** you should see `prisma migrate deploy` run (not skipped). If it skips, either URL is missing or Neon integration is overriding—see [hosting doc § Neon + Vercel](../hosting-vercel-and-worker.md#neon--vercel-one-database-for-builds).

### 3. Worker process (separate from Vercel)

Run on a machine with Node **18–20** and Chrome (see repo `engines` / `.nvmrc`).

| Variable | Value |
| -------- | ----- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | **Same** database as the Preview app. |
| `WEB_URL` | Exact Preview URL, e.g. `https://speech-cabinet-git-<branch>-collin-engs-projects.vercel.app` (no trailing slash issues—match what loads in browser). |
| `NEXTAUTH_SECRET` | Same as Vercel Preview. |
| `BLOB_READ_WRITE_TOKEN` | Same as Vercel (worker uploads to project Blob store). |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Same as Vercel if Previews are protection-gated. |
| `CHROME_PATH` | e.g. `auto` per [.env.example](../../.env.example). |

```bash
yarn install --frozen-lockfile && yarn prisma generate
yarn work   # or: yarn worker:prod / Docker worker service
```

### 4. Smoke test

Open the Preview URL → load a dialogue → **Watch** → **Render video** (or GIF). Expect progress, then download; if protection blocked Puppeteer before, you would have seen **401** on `/render` in worker logs—fix with bypass secret alignment.

---

## CLI shortcuts

```bash
# Mirror Preview env locally (after dashboard setup)
npx vercel env pull .env.vercel.preview --environment=preview --yes

# Push only DB URLs to Vercel Preview for a given Git branch (requires Vercel CLI auth)
node scripts/push-preview-db-env.mjs .env.vercel.preview <git-branch-name>
```

---

## Cursor transcript note

Chats are stored under a **folder UUID** (e.g. `30fb6d6b-0499-4234-8065-972faa651405` in agent-transcripts), not the per-request id shown in the UI. If you are looking for context tied to request id `361c3e62-3e76-4647-8aad-0557a2f5f723`, search agent-transcripts for that string or open the matching session’s `.jsonl` by date/title.
