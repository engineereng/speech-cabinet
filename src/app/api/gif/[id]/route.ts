import { NextResponse, type NextRequest } from "next/server";
import * as fs from "fs";
import { db } from "~/server/db";
import { getGifPath } from "~/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9A-F\-]+$/i.test(params.id)) {
    return new NextResponse(null, { status: 400 });
  }

  // Prefer the shared blob upload the worker produced (#18). Fall back to the legacy
  // local-fs path so `yarn dev` + `yarn work` on a single machine still works.
  const video = await db.video.findUnique({
    where: { id: params.id },
    select: { gifUrl: true },
  });
  if (video?.gifUrl) {
    const upstream = await fetch(video.gifUrl);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse(null, { status: 502 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/gif",
        "content-length": upstream.headers.get("content-length") ?? "",
        "cache-control": "private, max-age=0, no-store",
      },
    });
  }

  const gifPath = getGifPath(params.id);
  if (!fs.existsSync(gifPath)) {
    return new NextResponse(null, { status: 404 });
  }
  const file = await fs.openAsBlob(gifPath);
  return new NextResponse(file, { headers: { "content-type": "image/gif" } });
}
