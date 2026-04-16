import { defineConfig, devices } from "@playwright/test";
import { pathForVideoWorker } from "./e2e/path-for-video-worker";

/**
 * E2E tests assume Postgres has the Prisma schema applied (`yarn db:push` or `yarn db:generate`)
 * and that `DATABASE_URL` in `.env` points at that database (pg-boss uses the same URL).
 *
 * - `webServer` starts only Next (`yarn dev`). A second webServer for the worker is avoided:
 *   Playwright can hang when a long-running process has no `url` to wait on.
 * - The render worker is started in `e2e/global-setup.ts` (non-watch `yarn work`) and torn down
 *   in `e2e/global-teardown.ts`. Set `PW_SKIP_MANAGED_WORKER=1` if you already run `yarn dev:work`.
 * - Set `CI=true` to reuse an already-running Next server on :3000.
 * - `ffmpeg` must be installed and discoverable (e.g. `brew install ffmpeg` on macOS).
 *
 * Recordings:
 * - Videos: under test-results (video.webm per test). Set PW_VIDEO_OFF=1 to disable.
 * - HTML report (after a run): npx playwright show-report playwright-report
 * - Full trace (large): PW_TRACE=1 yarn test:e2e → trace.zip next to test output
 * - Stale Chrome profile lock under tmp/browser (e.g. after a crashed render): stop all workers, then
 *   PW_CLEAR_WORKER_BROWSER_TMP=1 yarn test:e2e so global setup removes tmp/browser before spawning the worker.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  timeout: 300_000,
  expect: { timeout: 300_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    trace: process.env.PW_TRACE === "1" ? "on" : "on-first-retry",
    video:
      process.env.PW_VIDEO_OFF === "1"
        ? "off"
        : { mode: "on", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "yarn dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ...process.env, PATH: pathForVideoWorker() },
  },
});
