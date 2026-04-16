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
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 300_000,
  expect: { timeout: 300_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    video: "on",
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
