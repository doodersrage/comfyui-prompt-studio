import type { Page } from "@playwright/test";
import { dismissBlockingOverlays } from "./overlays";

/** Navigate with retries for transient next-dev / Fast Refresh aborts. */
export async function gotoStable(
  page: Page,
  path: string,
  options?: { waitUntil?: "load" | "domcontentloaded" | "commit" | "networkidle" },
): Promise<void> {
  const waitUntil = options?.waitUntil ?? "domcontentloaded";
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil });
      // Sync/welcome modals often mount after first paint and block clicks.
      await dismissBlockingOverlays(page);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED|interrupted/i.test(message) || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(250 * (attempt + 1));
    }
  }
  throw lastError;
}
