# Vercel previews and the video render worker

The Next.js app on Vercel handles HTTP. **Video rendering** runs in a **separate long-lived process** (`yarn work` / `yarn worker:prod`) that uses **PostgreSQL** (via Prisma + pg-boss), **Chrome**, and **ffmpeg**. Nothing in `vercel.json` starts that process—you run it on another machine or container.

---

## Part A — Wire Preview on Vercel (dashboard)

Do this in **[Vercel](https://vercel.com)** → your team → **speech-cabinet** → **Settings** → **Environment Variables**.

1. **Open Environment Variables**  
   Project → **Settings** → **Environment Variables**.

2. **Add Postgres URLs for Preview**  
   - **`DATABASE_URL`**: Pooled connection string (e.g. Neon **pooler** host, `…-pooler…`). Used by the app at runtime.  
   - **`DATABASE_URL_UNPOOLED`**: Direct connection string (Neon **non-pooler** host, no PgBouncer). Required by Prisma in this repo for **`prisma migrate`** (`directUrl` in `prisma/schema.prisma`).  
   - **Environments**: enable **Preview** (and **Production** as needed).  
   - Use a **dedicated Neon branch or database** for previews when possible. Avoid pointing Preview at production data unless you intend to.

3. **Add the same secrets the app expects at runtime** (see `src/env.js` and `.env.example`). Typical minimum for a working Preview:

   | Variable | Preview notes |
   |----------|----------------|
   | `DATABASE_URL` | Required for Prisma, pg-boss, and auth adapter (Neon: **pooled** URL). |
   | `DATABASE_URL_UNPOOLED` | Neon **direct** URL for migrations (same DB as `DATABASE_URL`). Local Postgres without a pooler: set equal to `DATABASE_URL`. |
   | `NEXTAUTH_SECRET` | Required when `NODE_ENV` is `production` (Vercel). Generate once: `openssl rand -base64 32`. |
   | `NEXTAUTH_URL` | Often left unset on Vercel; NextAuth can use `VERCEL_URL`. If login redirects break, set to your Preview URL (e.g. `https://speech-cabinet-git-<branch>-<team>.vercel.app`). |
   | `CHROME_PATH` | **Web app** builds: set to `auto` or a path if your server code resolves it. The **render worker** (below) needs a real Chrome/Chromium path in its own environment. |

4. **Redeploy**  
   After saving variables, open **Deployments**, open the latest Preview, **⋯** → **Redeploy** (or push a commit).  
   Builds run `scripts/vercel-build.mjs`: **`prisma migrate deploy` runs only when both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are present** for that environment.

5. **Confirm**  
   Open the deployment **Build** log: you should see `prisma migrate deploy` succeed (not only “skipping migrate”).

---

## Part B — Minimal production (or Preview) render worker

The worker must reach the **same app URL** users use in the browser, because it drives Puppeteer against the `/render` page (`WEB_URL` in code defaults to `http://localhost:3000`).

### Environment for the worker process

Set these in the process manager / container (not necessarily identical to every Vercel UI variable name, but values must match reality):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Same database as the web app (pg-boss queue lives here). With Neon, use the **pooled** URL. |
| `DATABASE_URL_UNPOOLED` | Same DB via Neon **direct** host (for Prisma; match Vercel). Local: can match `DATABASE_URL`. |
| `WEB_URL` | Public base URL of the Next deployment the worker should render **against** (e.g. `https://speech-cabinet.vercel.app` or your Preview URL). **Must match** the site where users click “Render”. |
| `NODE_ENV` | `production` |
| `NEXTAUTH_SECRET` | Same value as Vercel (required in production by `src/env.js`). |
| `NEXTAUTH_URL` | Same as Vercel if you set it; often can match `WEB_URL` for simplicity when debugging. |
| `CHROME_PATH` | Path to Chrome/Chromium, or `auto` if your setup supports it (see `.env.example`). |

Optional: `RENDER_DEADLINE_MS` to cap stuck renders (see `src/worker/worker.ts`).

### Option 1 — Docker Compose (same repo)

`docker-compose.yml` already defines a **`worker`** service (`command: worker` → `yarn worker:prod` in `entrypoint.sh`). For a **single machine**:

1. Copy `.env.example` → `.env` and set `DATABASE_URL`, `NEXTAUTH_*`, `CHROME_PATH`, etc.
2. Set **`WEB_URL`** in Compose for the worker to your public site (replace the sample `http://web:3000` only if the worker must call the **external** HTTPS URL; for same-stack Docker, internal `http://web:3000` is normal).
3. Run: `docker compose up -d web worker db` (or your subset).

Scale **throughput** by running **more worker containers** (same `DATABASE_URL`, same `WEB_URL`), e.g. `docker compose up -d --scale worker=3` (adjust for CPU/RAM—each worker runs Chrome).

### Option 2 — One container elsewhere (Fly.io, Railway, ECS, a VM)

1. Build the same **`Dockerfile`** (or use a prebuilt image from your registry).
2. Override command to **`worker`** (see `entrypoint.sh`) or run `yarn worker:prod` with the env vars above injected.
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
  1. Locally, set **`DATABASE_URL`** and **`DATABASE_URL_UNPOOLED`** in `.env` to the same Neon values as Vercel Preview/Production.
  2. Run: `yarn db:resolve:failed-video-migration` (runs `prisma migrate resolve --rolled-back 20260416070000_video_render_error`).
  3. Run: `yarn db:migrate` to apply pending migrations (`20260416000000_init_schema`, then `video_render_error`).
  4. Trigger a **Redeploy** on Vercel (or push a commit). Build should pass `prisma migrate deploy` because the DB is aligned.
- **P3018**: See [Prisma troubleshooting](https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting). After adding the baseline `init_schema` migration, new empty databases apply migrations in order; **existing** Neon DBs that already recorded a **failed** migration need the resolve step above.

