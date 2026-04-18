# Vercel previews and the video render worker

The Next.js app on Vercel handles HTTP. **Video rendering** runs in a **separate long-lived process** (`yarn work` / `yarn worker:prod`) that uses **PostgreSQL** (via Prisma + pg-boss), **Chrome**, and **ffmpeg**. Nothing in `vercel.json` starts that process—you run it on another machine or container.

---

## Status log (issue #18 investigation)

- **Prisma + Neon (build)**: Fixed. The old Neon project exposed stuck migration `20260416070000_video_render_error` (error **P3009**) on host `ep-spring-breeze-anlzcc63`. That Neon project was **deleted** and a fresh one created; Preview `DATABASE_URL` / `DATABASE_URL_UNPOOLED` now point at the new database, and `prisma migrate deploy` runs cleanly on build.
- **Prisma client on Vercel**: Fixed. `prisma/schema.prisma` now declares `binaryTargets = ["native", "linux-arm64-openssl-3.0.x"]` so runtime no longer hits `PrismaClientInitializationError` on Vercel's Linux/ARM64 runtime.
- **Latest Preview**: `dpl_E9PfksJ5AGMQdSbjNHMscaYHxbSu` (commit `94da7ca`) is `READY` at `speech-cabinet-git-fix-18-rendering-stuck-collin-engs-projects.vercel.app` — verified via Vercel MCP `get_deployment`.
- **#18 root cause (current blocker): Vercel Deployment Protection.** Live test on `2026-04-17` against the Preview URL showed the worker successfully picked up the pg-boss job (`received job e2e2eed7-b091-40d6-a2af-eb7d6a81a217`), but Puppeteer got **`401`** on `GET https://speech-cabinet-git-fix-18-rendering-stuck-...vercel.app/render` because Preview deployments require SSO/password. web-video-creator then crashed downstream on `Animation.seekAnimations` (secondary symptom of loading an auth error page instead of `/render`). So H1/H2 are ruled out and the production fix is operational: either disable deployment protection for this environment or let the worker bypass it.
- **Deployment Protection bypass (done)**: `src/worker/worker.ts` now wraps `WEB_URL + '/render'` (and the music URL) with `withBypass(url)` which appends `x-vercel-protection-bypass=<secret>` + `x-vercel-set-bypass-cookie=samesitenone`. The secret lives in the worker's `.env` as `VERCEL_AUTOMATION_BYPASS_SECRET`. On Vercel it is auto-injected.
- **H3 confirmed and fixed**: Worker now uploads rendered mp4/gif to **Vercel Blob** via `@vercel/blob` (`src/worker/worker.ts#uploadArtifact`) and writes `Video.videoUrl` / `Video.gifUrl` (see migration `prisma/migrations/20260418000000_video_blob_urls`). The API routes `src/app/api/video/[id]/route.ts` and `src/app/api/gif/[id]/route.ts` proxy the blob back through Vercel so the UI's existing `<a download>` same-origin flow in `src/components/render-status-provider.tsx` keeps working.
- **Worker env requirements (#18, current)**:
  - `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — same Neon DB as Vercel.
  - `WEB_URL` — public URL of the deployment the worker should render against.
  - `VERCEL_AUTOMATION_BYPASS_SECRET` — only if the target deployment has Deployment Protection.
  - `BLOB_READ_WRITE_TOKEN` — required so the worker can upload to the Blob store attached to this Vercel project. Pull with `vercel env pull` once the store is created.
  - `CHROME_PATH=auto` — lets web-video-creator manage Chrome.

---

## New Neon database (after deleting or replacing a project)

Use this when you have a **fresh** Neon project and need Preview builds + local dev to match.

1. **Neon** — Create a project (and default branch) in the [Neon console](https://console.neon.tech). Open **Connection details** for the database you will use.
2. **Two URLs, same database** — Copy:
   - **Pooled** connection string (host usually contains `-pooler` or is labeled for serverless/pooled) → will become `DATABASE_URL`.
   - **Direct** connection string (non-pooler host; required for `prisma migrate` / `directUrl` in `prisma/schema.prisma`) → `DATABASE_URL_UNPOOLED`.
3. **Vercel** — **Settings → Environment Variables** for **Preview** (and **Production** if applicable): set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to those values. If the [Neon Vercel integration](https://vercel.com/integrations/neon) previously injected a different branch, **disconnect it** or re-link it to this project so build logs show the **same** `ep-…` host you expect.
4. **Local `.env`** — Paste the same two URLs into `.env` (see `.env.example`). Run `npx prisma migrate deploy` once against that database so migrations apply before you rely on the app.
5. **Optional: CLI mirror of Vercel env** — `npx vercel env pull .env.vercel.preview --environment=preview --yes` after step 3. Or use `node scripts/push-preview-db-env.mjs .env.vercel.preview <git-branch>` if your team requires branch-scoped Preview variables.
6. **Redeploy** — Push or **Redeploy** on Vercel; the build log should show `prisma migrate deploy` against your new host and finish without **P3009** on an empty database.

---

## Part A — Wire Preview on Vercel (dashboard)

Do this in **[Vercel](https://vercel.com)** → your team → **speech-cabinet** → **Settings** → **Environment Variables**.

1. **Open Environment Variables**
  Project → **Settings** → **Environment Variables**.
2. **Add Postgres URLs for Preview**
  - `**DATABASE_URL`**: Pooled connection string (e.g. Neon **pooler** host, `…-pooler…`). Used by the app at runtime.  
  - `**DATABASE_URL_UNPOOLED`**: Direct connection string (Neon **non-pooler** host, no PgBouncer). Required by Prisma in this repo for `**prisma migrate`** (`directUrl` in `prisma/schema.prisma`).  
  - **Environments**: enable **Preview** (and **Production** as needed).  
  - Use a **dedicated Neon branch or database** for previews when possible. Avoid pointing Preview at production data unless you intend to.
3. **Add the same secrets the app expects at runtime** (see `src/env.js` and `.env.example`). Typical minimum for a working Preview:

  | Variable                | Preview notes                                                                                                                                                                                                  |
  | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `DATABASE_URL`          | Required for Prisma, pg-boss, and auth adapter (Neon: **pooled** URL).                                                                                                                                         |
  | `DATABASE_URL_UNPOOLED` | Neon **direct** URL for migrations (same DB as `DATABASE_URL`). Local Postgres without a pooler: set equal to `DATABASE_URL`.                                                                                  |
  | `NEXTAUTH_SECRET`       | Optional until you add NextAuth providers / sign-in. If you enable OAuth later, set it (e.g. `openssl rand -base64 32`) for Preview and Production as needed.                                                  |
  | `NEXTAUTH_URL`          | Optional on Vercel: `env.js` falls back to `VERCEL_URL` for validation. If OAuth/callback URLs are wrong, set explicitly to your deployment URL, e.g. `https://speech-cabinet-git-<branch>-<team>.vercel.app`. |
  | `CHROME_PATH`           | On Vercel the app defaults to `**auto`** if unset (`VERCEL` is set). The **render worker** still needs a real Chrome path (or `auto`) in **its** environment.                                                  |

4. **Redeploy**
  After saving variables, open **Deployments**, open the latest Preview, **⋯** → **Redeploy** (or push a commit).  
   Builds run `scripts/vercel-build.mjs`: `**prisma migrate deploy` runs only when both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are present** for that environment.
5. **Confirm**
  Open the deployment **Build** log: you should see `prisma migrate deploy` succeed (not only “skipping migrate”).

### Neon + Vercel: one database for builds

`vercel env pull` (and a local `.env.vercel.preview` file) reflects **Project → Environment Variables**. The **Neon** integration can still inject or branch **different** `DATABASE_URL` values during GitHub deployments than the ones you see in the dashboard—build logs show the **actual** host Prisma connects to (e.g. `ep-…` in `prisma migrate deploy` output).

If that integration points at an old **preview branch** (deleted in Neon or stuck with **P3009**), builds fail even when your pulled env points at a healthy branch.

**Fix:** In [Vercel](https://vercel.com) → **Integrations** → **Neon**, align the linked database/branch with the Neon branch you want, **or** turn off automatic env injection so **only** the explicit `DATABASE_URL` and `DATABASE_URL_UNPOOLED` you set under **Settings → Environment Variables** are used (same pooled + direct pair you use locally). After they match, redeploy.

**Build log still shows a different `ep-…` host (e.g. `ep-spring-breeze-…`) than the DB you configured?** The integration is still winning. **Disconnect** the Neon integration from this Vercel project, then set `DATABASE_URL` + `DATABASE_URL_UNPOOLED` manually for Preview (and Production if needed). Redeploy and confirm the datasource line matches your Neon branch.

**Alternative (keep the same host):** On that exact database, fix **P3009** with [`prisma migrate resolve`](https://www.pris.ly/d/migrate-resolve) + `migrate deploy` using **that** branch’s pooled + direct URLs—no need to delete Neon if you only need to clear a stuck migration.

---

## Part B — Minimal production (or Preview) render worker

The worker must reach the **same app URL** users use in the browser, because it drives Puppeteer against the `/render` page (`WEB_URL` in code defaults to `http://localhost:3000`).

### Environment for the worker process

Set these in the process manager / container (not necessarily identical to every Vercel UI variable name, but values must match reality):


| Variable                | Purpose                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Same database as the web app (pg-boss queue lives here). With Neon, use the **pooled** URL.                                                                                                     |
| `DATABASE_URL_UNPOOLED` | Same DB via Neon **direct** host (for Prisma; match Vercel). Local: can match `DATABASE_URL`.                                                                                                   |
| `WEB_URL`               | Public base URL of the Next deployment the worker should render **against** (e.g. `https://speech-cabinet.vercel.app` or your Preview URL). **Must match** the site where users click “Render”. |
| `NODE_ENV`              | `production`                                                                                                                                                                                    |
| `NEXTAUTH_SECRET`       | Same value as Vercel (required in production by `src/env.js`).                                                                                                                                  |
| `NEXTAUTH_URL`          | Same as Vercel if you set it; often can match `WEB_URL` for simplicity when debugging.                                                                                                          |
| `CHROME_PATH`           | Path to Chrome/Chromium, or `auto` if your setup supports it (see `.env.example`).                                                                                                              |


Optional: `RENDER_DEADLINE_MS` to cap stuck renders (see `src/worker/worker.ts`).

### Option 1 — Docker Compose (same repo)

`docker-compose.yml` already defines a `**worker`** service (`command: worker` → `yarn worker:prod` in `entrypoint.sh`). For a **single machine**:

1. Copy `.env.example` → `.env` and set `DATABASE_URL`, `NEXTAUTH_*`, `CHROME_PATH`, etc.
2. Set `**WEB_URL`** in Compose for the worker to your public site (replace the sample `http://web:3000` only if the worker must call the **external** HTTPS URL; for same-stack Docker, internal `http://web:3000` is normal).
3. Run: `docker compose up -d web worker db` (or your subset).

Scale **throughput** by running **more worker containers** (same `DATABASE_URL`, same `WEB_URL`), e.g. `docker compose up -d --scale worker=3` (adjust for CPU/RAM—each worker runs Chrome).

### Option 2 — One container elsewhere (Fly.io, Railway, ECS, a VM)

1. Build the same `**Dockerfile`** (or use a prebuilt image from your registry).
2. Override command to `**worker**` (see `entrypoint.sh`) or run `yarn worker:prod` with the env vars above injected.
3. Ensure **ffmpeg** and **Chrome** exist in the image (the repo `Dockerfile` installs them for the all-in-one image).

### Option 3 — Bare metal / VPS

- Install **Node 20**, **Postgres client libraries**, **Chrome/Chromium**, **ffmpeg**.
- Clone the repo, `yarn install --frozen-lockfile`, `yarn prisma generate`, set env, run `yarn worker:prod`.

### Preview vs production worker

- **Preview**: point `WEB_URL` at the **Preview deployment URL** (branch alias). Use a Preview-safe `DATABASE_URL` if you use a branch DB.
- **Production**: point `WEB_URL` at your production domain.

You can run **two** worker processes (or two containers) with different `WEB_URL` values if you need both Preview and Production rendering—same pattern, different env files or orchestrator config.

---

## Troubleshooting

- **Queue never drains**: Worker not running, wrong `DATABASE_URL`, or `WEB_URL` not reachable from the worker host.
- **Migrate skipped on Vercel**: `DATABASE_URL` missing for that environment in the Vercel project settings.
- **Auth / env validation errors in worker**: Match `NEXTAUTH_SECRET` (and related) to Vercel.
- **P3009 / “failed migrations in the target database”** (e.g. after `20260416070000_video_render_error` failed on Neon): Prisma blocks new migrations until you mark that migration rolled back, then deploy again.
  1. Locally, set `**DATABASE_URL`** and `**DATABASE_URL_UNPOOLED**` in `.env` to the same Neon values as Vercel Preview/Production.
  2. Run: `yarn db:resolve:failed-video-migration` (runs `prisma migrate resolve --rolled-back 20260416070000_video_render_error`). **Skip this** if you see *“database without migrations table”* — that means `_prisma_migrations` was never created (new/reset DB). Go straight to step 3.
  3. Run: `yarn db:migrate` to apply pending migrations (`20260416000000_init_schema`, then `video_render_error`).
  4. Trigger a **Redeploy** on Vercel (or push a commit). Build should pass `prisma migrate deploy` because the DB is aligned.
- **P3018**: See [Prisma troubleshooting](https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting). After adding the baseline `init_schema` migration, new empty databases apply migrations in order; **existing** Neon DBs that already recorded a **failed** migration need the resolve step above.

