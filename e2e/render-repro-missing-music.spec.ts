import { test, expect } from "@playwright/test";
import { getDefaultData, serialize } from "~/lib/disco-data";
import { seedAndStartVideoRender } from "./helpers/render-flow";

/**
 * Repro for https://github.com/tm-a-t/speech-cabinet/issues/18 — worker never finishes when the
 * dialogue references a missing `/music/*` asset (404 during synthesis). UI stays on “Rendering…”.
 *
 * Run: `yarn test:e2e e2e/render-repro-missing-music.spec.ts`
 * Optional: `PW_REPRO_STUCK_MS=90000` (how long we require “Download started” to stay absent).
 */
const stuckMs = Math.max(30_000, Number(process.env.PW_REPRO_STUCK_MS ?? "60000") || 60_000);

test.describe("@repro-18 missing music asset", () => {
  test("stays on Rendering… without download", async ({ page }) => {
    test.setTimeout(stuckMs + 120_000);

    const d = getDefaultData();
    const payload = serialize({
      ...d,
      music: "/music/speech-cabinet-issue-18-missing-track.m4a",
    });

    await seedAndStartVideoRender(page, payload);

    await expect(
      page.getByText(/Rendering/i).or(page.getByText(/queue/i).or(page.getByText(/dialogues/i))),
    ).toBeVisible({ timeout: 60_000 });

    const download = page.getByText(/download started/i);
    const deadline = Date.now() + stuckMs;
    while (Date.now() < deadline) {
      if (await download.isVisible()) {
        throw new Error(
          "Expected stuck render (no download) for missing music, but download started — worker may have changed or asset exists.",
        );
      }
      await page.waitForTimeout(2000);
    }
  });
});
