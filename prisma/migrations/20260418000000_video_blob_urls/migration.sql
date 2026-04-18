-- #18: worker uploads mp4/gif to shared object storage (Vercel Blob); API routes read the URL.
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "gifUrl" TEXT;
