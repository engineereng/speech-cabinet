import type { Page } from "@playwright/test";

/** Seeds `localStorage`, opens the editor in watch mode, and starts an MP4 render. */
export async function seedAndStartVideoRender(page: Page, serializedDiscoData: string) {
  await page.addInitScript((payload: string) => {
    localStorage.setItem("data", payload);
  }, serializedDiscoData);
  await page.goto("/");
  await page.getByRole("button", { name: /watch/i }).click();
  await page.getByRole("button", { name: /render video/i }).click();
}
