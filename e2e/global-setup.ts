import type { FullConfig } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathForVideoWorker } from "./path-for-video-worker";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = join(root, ".playwright-worker.pid");

/**
 * Starts the render worker in its own process group so we can stop it in global-teardown.
 * If you already run `yarn dev:work`, set PW_SKIP_MANAGED_WORKER=1 to avoid a second worker.
 */
export default async function globalSetup(_config: FullConfig) {
  if (process.env.PW_SKIP_MANAGED_WORKER === "1") {
    return;
  }

  try {
    rmSync(join(root, "tmp/browser"), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  try {
    execSync("npx tsx --env-file=.env scripts/clear-render-queue.ts", {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env },
      timeout: 15_000,
    });
  } catch {
    /* ignore: DB may be unavailable in some environments */
  }

  const child = spawn("yarn", ["work"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    detached: true,
    env: {
      ...process.env,
      PATH: pathForVideoWorker(),
      // Cap stuck WebVideoCreator runs so repro tests finish in ~1–2m, not 5m+ (override with RENDER_DEADLINE_MS).
      RENDER_DEADLINE_MS: process.env.RENDER_DEADLINE_MS ?? "75000",
    },
  });

  let workerExitCode: number | undefined;
  child.on("exit", (code) => {
    workerExitCode = code === null ? -1 : code;
  });

  child.unref();

  if (child.pid) {
    writeFileSync(pidFile, String(child.pid));
  }

  await new Promise((r) => setTimeout(r, 3500));
  if (workerExitCode !== undefined && workerExitCode !== 0) {
    throw new Error(
      `[e2e] Render worker exited with code ${workerExitCode}. Check the worker output above. Common causes: (1) DATABASE_URL + \`yarn db:push\`; (2) Node 20 LTS (see .nvmrc); (3) \`ffmpeg\` on PATH (\`brew install ffmpeg\` on macOS).`,
    );
  }
}
