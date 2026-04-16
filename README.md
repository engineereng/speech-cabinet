
https://github.com/user-attachments/assets/305be07d-7696-4c65-95c5-b936a079bb02

<div align="center">

# Speech Cabinet

Create vertical videos in the style of Disco Elysium dialogues.
<br>
[speech-cabinet.com](https://speech-cabinet.com)

</div>

<br>

`Speech Cabinet is an unofficial fan project inspired by Disco Elysium. I am not affiliated with ZA/UM. Disco Elysium© and all related characters, artwork, and audio are property of ZA/UM. These assets are used here for non-commercial, fan purposes only. The code for this app is open-source (AGPL-3.0), but Disco Elysium assets remain under their original copyright. Generated videos are likewise fan-made and not for commercial use.`

## Tips

- Put quotes when characters speak out loud, like the game does.
- Choose an OST for the right vibes.
- You won’t lose your dialogue if you close the page, but you can always download the file to share or open it later.
- Add custom characters and skills; choose portraits for Harry and custom characters.
- You should build Communism -- precisely \*because\* it's impossible.

<details>
<summary><h2>Development</h2></summary>

### How it works

This is a Next.js app.

Animation is made purely with CSS/JS, but the videos are rendered on server: a worker starts a browser instance and records a webpage.

### Running

1. Create a Postgres database.
2. Copy `.env.example` to `.env` and fill in the variables. (Auth settings are not used for now.)
3. If you want to enable background music for videos, save OST music files to `public/music`.
   They must have a name in form `Sea Power - Instrument of Surrender.m4a`.
4. Install dependencies:
   ```shell
   yarn
   ```
5. Run:
    ```shell
    yarn dev
    ```
6. Run the video rendering worker separately:
    ```shell
    yarn dev:work
    ```

   (The worker requires maximum Node 20 because the library for rendering videos uses a deprecated function.)

### Rendering stuck on “Rendering…” (no download)

This usually means the **worker never finished** the job (the hosted site has seen similar queue issues; see [#18](https://github.com/tm-a-t/speech-cabinet/issues/18)). When self-hosting, check:

- **Worker running**: `yarn dev:work` (or your process manager) alongside `yarn dev`.
- **Node 20**: Newer Node versions can break the video library; use `.nvmrc` / `engines` in `package.json`.
- **`DATABASE_URL`**: Must point at Postgres with the schema applied (`yarn db:push`). A wrong role name often shows up when **PgBoss** starts.
- **`ffmpeg` on `PATH`**: Required for video synthesis.
- **Background music**: Default project data uses **no** OST until you add files under `public/music/` and pick one in the UI. A missing track URL can fail the worker.
- **Stale queue**: After crashes or bad jobs, run `yarn queue:clear` (worker stopped), then restart the worker.
- **Dev server oddities**: If `/` 404s until restart, try removing `.next` and starting again.

### E2E (Playwright)

Upstream tracker: [#18](https://github.com/tm-a-t/speech-cabinet/issues/18). Install browsers once: `npx playwright install chromium`.

```shell
yarn test:e2e
```

- **Artifacts**: After a run, open `npx playwright show-report playwright-report` for the HTML report. Raw screen recordings are `video.webm` files under `test-results/`.
- **Traces**: `PW_TRACE=1 yarn test:e2e` records a trace zip per test (large).
- **Managed worker**: By default the suite spawns `yarn work`. If you already use `yarn dev:work`, set `PW_SKIP_MANAGED_WORKER=1`.
- **Chrome profile lock** (`SingletonLock` under `tmp/browser`): stop every worker, then run with `PW_CLEAR_WORKER_BROWSER_TMP=1 yarn test:e2e` so the suite clears `tmp/browser` before starting the worker.
- **Stress / repro**:
  - `PW_STRESS_ITERATIONS=5 yarn test:e2e e2e/render-stress.spec.ts` — several full renders in one tab.
  - `yarn test:e2e e2e/render-repro-missing-music.spec.ts` — expects “Rendering…” without download when the OST URL 404s (optional: `PW_REPRO_STUCK_MS=60000`).

### Contributing from a fork

Keep **`origin`** as the upstream repo (`tm-a-t/speech-cabinet`) and add your fork as **`fork`**:

```shell
git remote add fork git@github.com:YOUR_USER/speech-cabinet.git
git fetch origin
git checkout fix/18-rendering-stuck   # or your branch
git push -u fork fix/18-rendering-stuck
```

Open the PR from your fork’s branch against **`tm-a-t/speech-cabinet:main`**.

**Splitting into two PRs (example):**

1. **Mitigations / docs** — e.g. `src/lib/disco-data.ts`, `src/server/queue.ts`, `scripts/clear-render-queue.ts`, README / `.env.example`, `queue:clear` + non-Playwright `package.json` / `yarn.lock` hunks (and optionally `engines` / `.nvmrc`).
2. **E2E** — branch stacked on (1): `e2e/`, `playwright.config.ts`, Playwright devDependency + lockfile, `.gitignore` entries for test output.

Use a second branch based on the first PR branch so `package.json` / `yarn.lock` do not fight each other.

### Using Docker

The Docker image should build normally&mdash;but not on macOS, apparently?
Downloading Chrome in Docker doesn’t work on my macOS for some reason.

</details>

## Contributions

Suggestions and contributions are welcome!
