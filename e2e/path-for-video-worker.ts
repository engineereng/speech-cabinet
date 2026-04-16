/**
 * Homebrew / Intel Homebrew bins — GUI-launched Playwright often has a minimal PATH,
 * so `ffmpeg` is ENOENT unless we prepend these.
 */
export function pathForVideoWorker(): string {
  return ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH ?? ""]
    .filter(Boolean)
    .join(":");
}
