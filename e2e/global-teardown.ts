import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = join(root, ".playwright-worker.pid");

export default async function globalTeardown() {
  if (process.env.PW_SKIP_MANAGED_WORKER === "1") {
    return;
  }
  if (!existsSync(pidFile)) {
    return;
  }
  try {
    const pid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    if (!Number.isNaN(pid)) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        process.kill(pid, "SIGTERM");
      }
    }
    unlinkSync(pidFile);
  } catch {
    // ignore
  }
}
