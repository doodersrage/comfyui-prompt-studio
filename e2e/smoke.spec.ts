import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

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
  await expect(page.getByRole("heading", { name: /ComfyUI Gallery/i })).toBeVisible();
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

test("settings comfyui loader maps section loads", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "ComfyUI", exact: true }).click();
  await expect(page.getByRole("button", { name: /Merge suggested loader maps/i })).toBeVisible();
  await expect(page.getByText(/Checkpoint map/i)).toBeVisible();
});

const ADDITIONAL_ROUTES: Array<{ path: string; heading: RegExp; level?: 1 | 2 | 3 | 4 | 5 | 6 }> = [
  { path: "/character", heading: /Character Generator/i },
  { path: "/background", heading: /Background Generator/i },
  { path: "/fantasy", heading: /Fantasy Scene Generator/i },
  { path: "/pet", heading: /Pet Scene Generator/i },
  { path: "/refine", heading: /Prompt Refine/i },
  { path: "/format", heading: /Format for your model/i },
  { path: "/prompt", heading: /Prompt Editor/i },
  { path: "/negative", heading: /Negative Prompt Builder/i },
  { path: "/lint", heading: /Prompt Lint & Fix/i },
  { path: "/topics", heading: /Topic Generator/i },
  { path: "/variations", heading: /Variation Grid/i },
  { path: "/video", heading: /Video prompt builder/i },
  { path: "/image-prompt", heading: /Image → Prompt/i },
  { path: "/inpaint", heading: /FLUX Inpaint/i },
  { path: "/plugins", heading: /^Plugins$/i },
  { path: "/profile", heading: /^Profile$/i, level: 1 as const },
  { path: "/studio", heading: /Prompt Studio/i },
];

for (const route of ADDITIONAL_ROUTES) {
  test(`${route.path} loads`, async ({ page }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { name: route.heading, level: route.level }),
    ).toBeVisible({
      timeout: 60_000,
    });
  });
}
