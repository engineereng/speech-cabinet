/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */


import {boss, queue, type RenderVideoJob} from '~/server/queue';
import {type DiscoData, serialize} from '~/lib/disco-data';
import { getGifPath, getVideoPath } from "~/lib/utils";
import {totalDuration, totalTimeLimit} from '~/lib/time';
import {db} from '~/server/db';
// @ts-expect-error untyped lib :(
import WebVideoCreator from 'web-video-creator';
// @ts-expect-error untyped lib :(
import { type Page } from "web-video-creator/core";
import { type Page as PuppeteerPage } from "puppeteer-core";
import { env } from "~/env";
import { spawn } from 'child_process';
import { put } from '@vercel/blob';
import * as fs from 'node:fs';

const wvc = new WebVideoCreator();
wvc.config({
  browserVersion: '136.0.7103.113',
  debug: true,
  browserDebug: true,
  ffmpegDebug: true,
  ffmpegExecutablePath: 'ffmpeg',
  browserExecutablePath: env.CHROME_PATH === "auto" ? undefined : env.CHROME_PATH,
  allowUnsafeContext: true,
  browserUseGPU: false,
  compatibleRenderingMode: true,
});

const WEB_URL = env.WEB_URL ?? 'http://localhost:3000'
const GIF_FPS = 10
const GIF_WIDTH = 720

/**
 * Append Vercel Deployment-Protection bypass query params when a secret is configured,
 * so Puppeteer can reach protected Preview URLs (issue #18). The `samesitenone` cookie
 * variant lets sub-requests from the page (e.g. music) pass without per-URL rewrites.
 */
function withBypass(rawUrl: string): string {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('x-vercel-protection-bypass', secret);
    u.searchParams.set('x-vercel-set-bypass-cookie', 'samesitenone');
    return u.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}x-vercel-protection-bypass=${encodeURIComponent(secret)}&x-vercel-set-bypass-cookie=samesitenone`;
  }
}

/** Wall-clock cap for `video.startAndWait()` so a stuck WebVideoCreator run does not block the worker forever (#18). */
const DEFAULT_RENDER_DEADLINE_MS = 60 * 60 * 1000;

function renderDeadlineMs(): number {
  const raw = process.env.RENDER_DEADLINE_MS;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return DEFAULT_RENDER_DEADLINE_MS;
}

function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return p;
  }
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} exceeded ${String(ms)}ms (RENDER_DEADLINE_MS)`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

async function renderVideo(data: DiscoData, id: string, convertToGif: boolean) {
  try {
    const filename = getVideoPath(id);

    const video = wvc.createSingleVideo({
      url: withBypass(WEB_URL + '/render'),
      width: 1080,
      height: 1920,
      fps: 30,
      duration: Math.min(totalDuration(data), totalTimeLimit),
      outputPath: filename,
      pagePrepareFn: async (page: Page) => {
        const puppeteerPage = page.target as PuppeteerPage;
        const serialized = serialize(data);
        await puppeteerPage.evaluate(({serialized}) => {
          localStorage.setItem('data', serialized);
          window.dispatchEvent(new Event('disco', {}));
        }, { serialized });
      },
    });

    // Add music here because music added with <audio> in Player
    // does not work for some reason.
    // Constants derived from music.ts#playMusic, should refactor this later.
    if (data.music) {
      video.addAudio({
        url: withBypass(WEB_URL + data.music),
        volume: 20,
        loop: true,
        seekStart: data.skipMusicIntro ? 37000 : 0,
      });
    }

    video.on("progress", async (progress: number) => {
      await db.video.update({where: {id}, data: {progress: Math.floor(progress)}}).catch(console.error);
    });
    await withDeadline(
      video.startAndWait() as Promise<void>,
      renderDeadlineMs(),
      'video.startAndWait',
    );

    if (convertToGif) {
      await run(
        `ffmpeg`,
        `-i`, filename,
        `-vf`, `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,palettegen`,
        `${filename}.palette.png`,
        `-update`, `true`,
        `-nostdin`,
      );
      await run(
        `ffmpeg`,
        `-i`, filename,
        `-i`, `${filename}.palette.png`,
        `-lavfi`, `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos [x]; [x][1:v] paletteuse`,
        `-nostdin`,
        getGifPath(id),
      );
    }

    // Upload artifacts to shared object storage so the Vercel app can serve them (#18).
    // Without this, /api/video/[id] 404s because the lambda has no access to the worker's local fs.
    const videoUrl = await uploadArtifact(id, filename, 'video/mp4');
    const gifUrl = convertToGif
      ? await uploadArtifact(id, getGifPath(id), 'image/gif')
      : null;

    await db.video.update({
      where: {id},
      data: {isReady: true, renderError: null, videoUrl, gifUrl},
    });
  } catch (err) {
    const message = String(err).slice(0, 8000);
    await db.video.update({where: {id}, data: {renderError: message}}).catch(console.error);
    throw err;
  }
}

/**
 * Upload a rendered artifact (mp4 / gif) to Vercel Blob so the Next.js app running on
 * Vercel can serve it from `src/app/api/{video,gif}/[id]/route.ts` (#18). Falls back
 * to `null` (local-only dev without BLOB_READ_WRITE_TOKEN) so the worker stays usable
 * against a purely local stack.
 */
async function uploadArtifact(
  id: string,
  filePath: string,
  contentType: 'video/mp4' | 'image/gif',
): Promise<string | null> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    console.warn(
      `[worker] BLOB_READ_WRITE_TOKEN not set; skipping upload of ${filePath}. Vercel-hosted downloads will 404.`,
    );
    return null;
  }
  const ext = contentType === 'image/gif' ? 'gif' : 'mp4';
  const pathname = `videos/${id}.${ext}`;
  const stream = fs.createReadStream(filePath);
  const { url } = await put(pathname, stream, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return url;
}

function run(command: string, ...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args);

    p.stdout.on('data', (x: string | Uint8Array) => {
      process.stdout.write(x.toString());
    });
    p.stderr.on('data', (x: string | Uint8Array) => {
      process.stderr.write(x.toString());
    });
    p.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
    p.on('error', (err) => {
      reject(err);
    });
  });
}

async function runWorker() {
  await boss.createQueue(queue);

  await boss.work(queue, async (jobs: RenderVideoJob[]) => {
    const job = jobs[0]!;  // Only one job by default
    console.log(`received job ${job.id} with data ${JSON.stringify(job.data)}`);
    await renderVideo(job.data.discoData, job.data.videoId, job.data.convertToGif ?? false);
  });
}

runWorker()
  .catch(err => {
    console.log(err);
    process.exit(1);
  });
