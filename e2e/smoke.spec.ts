import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedGalleryFixture } from './helpers/gallery';
import { gotoStable, openComfyUiSettingsTab, revealFullSettings } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('home page loads', async ({ page }) => {
  await gotoStable(page, '/');
  await expect(page.getByRole('heading', { name: /^Generate$/i })).toBeVisible();
});

test('dashboard page loads', async ({ page }) => {
  await gotoStable(page, '/dashboard');
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Gallery', exact: true })).toBeVisible();
});

test('gallery page loads', async ({ page }) => {
  await gotoStable(page, '/gallery');
  await expect(page.getByRole('heading', { name: /^Gallery$/i, level: 1 })).toBeVisible();
});

test('queue page loads', async ({ page }) => {
  await gotoStable(page, '/queue');
  await expect(page.getByRole('heading', { name: /ComfyUI job queue/i })).toBeVisible();
});

test('settings page loads', async ({ page }) => {
  await gotoStable(page, '/settings?tab=automation');
  await revealFullSettings(page);
  await expect(page.getByRole('navigation', { name: /Settings sections/i })).toBeVisible();
  // Exact heading — empty state also has "No avoided tokens yet".
  await expect(page.getByRole('heading', { name: 'Avoided tokens', exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

test('controlnet page loads', async ({ page }) => {
  await gotoStable(page, '/controlnet');
  await expect(page.getByRole('heading', { name: /^ControlNet$/i })).toBeVisible();
});

test('studio analytics tab loads', async ({ page }) => {
  await gotoStable(page, '/studio');
  const analyticsTab = page.getByRole('button', { name: 'Analytics', exact: true });
  await expect(analyticsTab).toBeVisible({ timeout: 60_000 });
  await analyticsTab.click();
  await expect(page.getByRole('heading', { name: /Gallery rating analytics/i })).toBeVisible();
});

test('settings comfyui loader maps section loads', async ({ page }) => {
  // Loader maps live under workflow-patching (not the top of the ComfyUI tab).
  await gotoStable(page, '/settings?tab=comfyui&section=workflow-patching');
  await openComfyUiSettingsTab(page);
  await expect(page.getByText(/Checkpoint map/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Merge suggested loader maps/i })).toBeVisible({
    timeout: 15_000,
  });
});

test('settings workflow health panel loads', async ({ page }) => {
  await gotoStable(page, '/settings?tab=comfyui&section=workflow-library');
  await openComfyUiSettingsTab(page);
  await expect(page.getByText(/Workflow library health/i)).toBeVisible({ timeout: 30_000 });
});

test('gallery selection bar documents bulk upscale actions', async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, '/gallery');
  await expect(page.getByRole('heading', { name: /^Gallery$/i, level: 1 })).toBeVisible();
  // Count may be 1 (CI fixture) or higher when a local gallery store already exists.
  const selectVisible = page.getByRole('button', { name: /Select visible \(\d+\)/i });
  await expect(selectVisible).toBeVisible({ timeout: 15_000 });
  // Storage sync can reappear after gallery hydrate; clear again before clicking.
  await dismissBlockingOverlays(page);
  await selectVisible.click();
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(page.getByRole('button', { name: /Bulk upscale → Final/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bulk refine →/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bulk new variation/i })).toBeVisible();
});

const ADDITIONAL_ROUTES: Array<{ path: string; heading: RegExp; level?: 1 | 2 | 3 | 4 | 5 | 6 }> = [
  { path: '/character', heading: /^Character$/i },
  { path: '/background', heading: /^Background$/i },
  { path: '/fantasy', heading: /^Fantasy$/i },
  { path: '/pet', heading: /^Pet$/i },
  { path: '/refine', heading: /^Refine$/i },
  { path: '/format', heading: /Format for your model/i },
  { path: '/prompt', heading: /Prompt Editor/i },
  { path: '/negative', heading: /^Negative$/i },
  { path: '/lint', heading: /^Lint$/i },
  { path: '/topics', heading: /^Topics$/i },
  { path: '/variations', heading: /^Variations$/i },
  { path: '/video', heading: /^Video$/i },
  { path: '/image-prompt', heading: /Image → Prompt/i },
  { path: '/inpaint', heading: /^Inpaint$/i },
  { path: '/plugins', heading: /^Plugins$/i },
  { path: '/profile', heading: /^Profile$/i, level: 1 as const },
  { path: '/studio', heading: /Prompt Studio/i },
];

for (const route of ADDITIONAL_ROUTES) {
  test(`${route.path} loads`, async ({ page }) => {
    await gotoStable(page, route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, level: route.level })
    ).toBeVisible({
      timeout: 60_000,
    });
  });
}
