import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";
import { gotoStable } from "./helpers/navigation";

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test("generate accepts keywords without server error", async ({ page }) => {
  await gotoStable(page, "/");
  await page.getByRole("button", { name: "Manual hints", exact: true }).click();
  const keywords = page.getByLabel(/Scene idea or keywords/i);
  await expect(keywords).toBeVisible({ timeout: 60_000 });
  await keywords.click();
  await keywords.fill("neon alley, rain, black cat");
  await expect(keywords).toHaveValue(/neon alley/);
  await expect(page.getByRole("button", { name: /Generate scene prompt/i })).toBeEnabled({
    timeout: 15_000,
  });
});

test("gallery review mode toggles", async ({ page }) => {
  await gotoStable(page, "/gallery");
  // Review toggles live inside the collapsed Filters section.
  await page.locator("summary").filter({ hasText: "Filters" }).click();
  await page.getByRole("button", { name: "Review mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto-advance", exact: true })).toBeVisible();
});

test("settings automation tab shows avoided tokens", async ({ page }) => {
  await gotoStable(page, "/settings?tab=automation");
  await expect(page.getByRole("heading", { name: "Avoided tokens", exact: true })).toBeVisible({
    timeout: 15_000,
  });
});
