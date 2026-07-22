import type { Page } from "@playwright/test";

/** Close overlays that block clicks (storage sync conflict, workspace welcome, etc.). */
export async function dismissBlockingOverlays(page: Page): Promise<void> {
  // Storage sync conflict (z-120) — can appear after AutoStorageSyncInit runs.
  const decideLater = page.getByRole("button", { name: "Decide later", exact: true });
  if (await decideLater.isVisible({ timeout: 800 }).catch(() => false)) {
    await decideLater.click();
  }

  // One-time workspace density picker.
  const skipWelcome = page.getByRole("button", { name: /Skip — use Studio/i });
  if (await skipWelcome.isVisible({ timeout: 800 }).catch(() => false)) {
    await skipWelcome.click();
  }
}
