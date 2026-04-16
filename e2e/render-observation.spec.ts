import { test, expect } from "@playwright/test";
import { getDefaultData, serialize } from "~/lib/disco-data";

/** Default serialized editor data (`music: null` avoids gitignored `/music/*` 404s in the worker). */
const DISCO_PAYLOAD = serialize(getDefaultData());

/**
 * Observes the export UI (issue #18: "Rendering" stuck with no download).
 * Playwright starts Next via webServer and the worker via global-setup; use PW_SKIP_MANAGED_WORKER=1 if you already run `yarn dev:work`.
 */
test("Watch → Render video records until download starts", async ({ page }) => {
  await page.addInitScript((payload) => {
    localStorage.setItem("data", payload);
  }, DISCO_PAYLOAD);

  await page.goto("/");

  await page.getByRole("button", { name: /watch/i }).click();

  await page.getByRole("button", { name: /render video/i }).click();

  await expect(page.getByText(/download started/i)).toBeVisible({
    timeout: 300_000,
  });
});
