import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ComfyUI Image Prompt Generator/i })).toBeVisible();
});

test("dashboard page loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible();
});

test("settings page loads", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /Settings & Health/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Avoided tokens/i })).toBeVisible();
});

test("studio analytics tab loads", async ({ page }) => {
  await page.goto("/studio");
  const analyticsTab = page.getByRole("button", { name: "Analytics", exact: true });
  await expect(analyticsTab).toBeVisible({ timeout: 60_000 });
  await analyticsTab.click();
  await expect(page.getByRole("heading", { name: /Gallery rating analytics/i })).toBeVisible();
});
