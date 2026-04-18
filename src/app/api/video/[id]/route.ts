import { NextResponse, type NextRequest } from "next/server";
import * as fs from "fs";
import { db } from "~/server/db";
import { getVideoPath } from "~/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9A-F\-]+$/i.test(params.id)) {
    return new NextResponse(null, { status: 400 });
  }

  // Prefer the shared blob upload the worker produced (#18). Fall back to the legacy
  // local-fs path so `yarn dev` + `yarn work` on a single machine still works.
  const video = await db.video.findUnique({
    where: { id: params.id },
    select: { videoUrl: true },
  });
  if (video?.videoUrl) {
    const upstream = await fetch(video.videoUrl);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse(null, { status: 502 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "video/mp4",
        "content-length": upstream.headers.get("content-length") ?? "",
        "cache-control": "private, max-age=0, no-store",
      },
    });
  }

  const videoPath = getVideoPath(params.id);
  if (!fs.existsSync(videoPath)) {
    return new NextResponse(null, { status: 404 });
  }
  const file = await fs.openAsBlob(videoPath);
  return new NextResponse(file, { headers: { "content-type": "video/mp4" } });
}
