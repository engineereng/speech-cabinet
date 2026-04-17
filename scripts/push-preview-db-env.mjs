/**
 * Set Vercel Preview DATABASE_URL + DATABASE_URL_UNPOOLED from a local env file.
 * Some teams require a Git branch for Preview — pass it as the 2nd arg (e.g. fix/18-rendering-stuck).
 *
 * Usage: node scripts/push-preview-db-env.mjs [.env.vercel.preview] [git-branch]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] ?? join(root, ".env.vercel.preview");
const gitBranch = process.argv[3];

function parseDotenv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const text = readFileSync(file, "utf8");
const env = parseDotenv(text);

for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
  const value = env[name];
  if (!value) {
    console.error(`Missing ${name} in ${file}`);
    process.exit(1);
  }
  const args = [
    "vercel",
    "env",
    "add",
    name,
    "preview",
    ...(gitBranch ? [gitBranch] : []),
    "--value",
    value,
    "--yes",
    "--force",
    "--sensitive",
  ];
  const r = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("Updated Vercel Preview DATABASE_URL and DATABASE_URL_UNPOOLED.");
