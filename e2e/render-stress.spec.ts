import { test, expect } from "@playwright/test";
import { getDefaultData, serialize } from "~/lib/disco-data";
import { seedAndStartVideoRender } from "./helpers/render-flow";

const iterations = Math.max(1, Math.min(20, Number(process.env.PW_STRESS_ITERATIONS ?? "3") || 3));

test.describe.configure({ mode: "serial" });

test(`stress: ${iterations} consecutive successful renders (same tab)`, async ({ page }) => {
  test.setTimeout(300_000 * iterations + 60_000 * iterations);
  const payload = serialize(getDefaultData());

  for (let i = 1; i <= iterations; i++) {
    await seedAndStartVideoRender(page, payload);
    await expect(page.getByText(/download started/i)).toBeVisible({
      timeout: 300_000,
    });
    await page.locator("button.absolute.right-1.top-1").click();
    await page.evaluate(() => localStorage.removeItem("data"));
    if (i < iterations) {
      await page.waitForTimeout(5000);
    }
  }
});
