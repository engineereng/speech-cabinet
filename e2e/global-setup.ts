import type { FullConfig } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
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

  const child = spawn("yarn", ["work"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    detached: true,
    env: { ...process.env, PATH: pathForVideoWorker() },
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
