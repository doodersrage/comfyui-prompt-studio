import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ComfyUI Image Prompt Generator/i })).toBeVisible();
});

test("dashboard page loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Gallery & slideshow/i })).toBeVisible();
});

test("gallery page loads", async ({ page }) => {
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { name: /^Gallery$/i })).toBeVisible();
});

test("queue page loads", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: /ComfyUI job queue/i })).toBeVisible();
});

test("settings page loads", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /Settings & Health/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Settings sections/i })).toBeVisible();
  await page.getByRole("button", { name: "Automation", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Avoided tokens/i })).toBeVisible();
});

test("controlnet page loads", async ({ page }) => {
  await page.goto("/controlnet");
  await expect(page.getByRole("heading", { name: /ControlNet prompt builder/i })).toBeVisible();
});

test("studio analytics tab loads", async ({ page }) => {
  await page.goto("/studio");
  const analyticsTab = page.getByRole("button", { name: "Analytics", exact: true });
  await expect(analyticsTab).toBeVisible({ timeout: 60_000 });
  await analyticsTab.click();
  await expect(page.getByRole("heading", { name: /Gallery rating analytics/i })).toBeVisible();
});
