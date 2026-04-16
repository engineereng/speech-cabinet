/**
 * Removes non-finished jobs from the pg-boss `render-video` queue.
 * Use when the UI shows a long queue or "Rendering…" forever after worker crashes / bad jobs.
 *
 * Stop the worker (`yarn dev:work`) before running, then restart it after.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(`
    DELETE FROM pgboss.job
    WHERE name = 'render-video'
      AND state IN ('created', 'active', 'retry')
  `);
  console.log(
    `Removed ${String(result)} job row(s) from pgboss.job (queue render-video: created/active/retry).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
