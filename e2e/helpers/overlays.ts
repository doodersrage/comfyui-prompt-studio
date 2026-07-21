import type { Page } from "@playwright/test";

/** Close overlays that block clicks (storage sync conflict, etc.). */
export async function dismissBlockingOverlays(page: Page): Promise<void> {
  const decideLater = page.getByRole("button", { name: "Decide later", exact: true });
  if (await decideLater.isVisible({ timeout: 500 }).catch(() => false)) {
    await decideLater.click();
  }
}
