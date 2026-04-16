import { test, expect } from "@playwright/test";
import { getDefaultData, serialize } from "~/lib/disco-data";
import { seedAndStartVideoRender } from "./helpers/render-flow";

/** Default serialized editor data (`music: null` avoids gitignored `/music/*` 404s in the worker). */
const DISCO_PAYLOAD = serialize(getDefaultData());

/**
 * Observes the export UI (issue #18: "Rendering" stuck with no download).
 * Playwright starts Next via webServer and the worker via global-setup; use PW_SKIP_MANAGED_WORKER=1 if you already run `yarn dev:work`.
 */
test("Watch → Render video records until download starts", async ({ page }) => {
  await seedAndStartVideoRender(page, DISCO_PAYLOAD);

  await expect(page.getByText(/download started/i)).toBeVisible({
    timeout: 300_000,
  });
});
