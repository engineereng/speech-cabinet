import PgBoss, {type Db, type Job} from 'pg-boss';
import {env} from '~/env';
import type {DiscoData} from '~/lib/disco-data';

export const boss = new PgBoss(env.DATABASE_URL);
boss.on('error', console.error);

try {
  await boss.start();
} catch (e) {
  const err = e instanceof Error ? e.message : String(e);
  let dbUser = '(unknown)';
  try {
    dbUser = new URL(env.DATABASE_URL).username || '(empty)';
  } catch {
    dbUser = '(invalid-url)';
  }
  const roleHint =
    err.includes('role') && err.includes('does not exist')
      ? ` DATABASE_URL user "${dbUser}" is not a PostgreSQL role on this server. Create it or use an existing user (many local installs use the superuser "postgres"). See .env.example.`
      : ' Check DATABASE_URL, Postgres is running, and run `yarn db:push` so the schema exists.';
  throw new Error(`PgBoss could not start:${roleHint} (${err})`, {cause: e});
}

export const queue = 'render-video';
type RenderVideoData = {
  videoId: string
  discoData: DiscoData
  convertToGif: boolean
}
export type RenderVideoJob = Job<RenderVideoData>

export async function startJob(data: RenderVideoData): Promise<void> {
  await boss.send(queue, data, {id: data.videoId});
}

export async function jobIsPending(id: string): Promise<boolean> {
  const job = await boss.getJobById(queue, id);
  return job?.state === 'created';
}

export async function getJobPosition(id: string): Promise<number> {

  const sql = `
      SELECT count(*) as count
      FROM pgboss.job
      WHERE name = $1
        AND state IN ('active', 'created')
        AND created_on < (SELECT created_on FROM pgboss.job WHERE id = $2)`;

  // @ts-expect-error untyped method
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const db = await boss.getDb() as Db;
  const result = await db.executeSql(sql, [queue, id]) as { rows: { count: string }[] };
  return parseFloat(result.rows[0]!.count);
}
