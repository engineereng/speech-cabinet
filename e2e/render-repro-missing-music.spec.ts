import { test, expect } from "@playwright/test";
import { getDefaultData, serialize } from "~/lib/disco-data";
import { seedAndStartVideoRender } from "./helpers/render-flow";

/**
 * Repro for https://github.com/tm-a-t/speech-cabinet/issues/18 — missing `/music/*` (404) causes the
 * worker to error. The UI should show "Rendering failed" instead of polling "Rendering…" forever.
 */
test.describe("@repro-18 missing music asset", () => {
  test("shows Rendering failed after worker error", async ({ page }) => {
    // Worker RENDER_DEADLINE_MS defaults to 75s; pg-boss may retry once — cap total wait below old 5m runs.
    test.setTimeout(200_000);

    const d = getDefaultData();
    const payload = serialize({
      ...d,
      music: "/music/speech-cabinet-issue-18-missing-track.m4a",
    });

    await seedAndStartVideoRender(page, payload);

    await expect(page.getByText(/Rendering failed/i)).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/download started/i)).not.toBeVisible();
  });
});
