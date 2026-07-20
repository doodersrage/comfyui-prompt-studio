import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test("generate accepts keywords without server error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/Scene idea or keywords/i).fill("neon alley, rain, black cat");
  await page.waitForTimeout(500);
  await expect(page.getByRole("button", { name: /Generate scene prompt/i })).toBeEnabled({
    timeout: 10_000,
  });
});

test("gallery review mode toggles", async ({ page }) => {
  await page.goto("/gallery");
  await page.getByRole("button", { name: "Review mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto-advance", exact: true })).toBeVisible();
});

test("settings automation tab shows avoided tokens", async ({ page }) => {
  await page.goto("/settings?tab=automation");
  await expect(page.getByRole("heading", { name: /Avoided tokens/i })).toBeVisible({
    timeout: 15_000,
  });
});
