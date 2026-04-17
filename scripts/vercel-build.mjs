import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

const dbUrl = process.env.DATABASE_URL?.trim();
const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
if (dbUrl && directUrl) {
  run("npx", ["prisma", "migrate", "deploy"]);
} else if (dbUrl && !directUrl) {
  console.warn(
    "[vercel-build] DATABASE_URL_UNPOOLED is not set; skipping prisma migrate deploy. Add Neon’s unpooled connection string (see prisma/schema.prisma directUrl).",
  );
} else {
  console.warn(
    "[vercel-build] DATABASE_URL is not set; skipping prisma migrate deploy. Add DATABASE_URL to the Preview (and Production) environment on Vercel so migrations run on deploy.",
  );
}

run("npx", ["prisma", "generate"]);
run("npx", ["next", "build"], { SKIP_ENV_VALIDATION: "true" });
