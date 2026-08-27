import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('play campaign wizard loads with steps and share controls', async ({ page }) => {
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Play campaign$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('play-campaign')).toBeVisible();
  await expect(page.getByTestId('play-campaign-character')).toBeVisible();
  await expect(page.getByTestId('play-campaign-steps')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-moodboard')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-fitting')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-day')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-roleplay')).toBeVisible();
  await expect(page.getByTestId('play-look-pack-export')).toBeVisible();
  await expect(page.getByTestId('play-campaign-start-moodboard')).toBeVisible();
});

test('fitting room happy path chrome loads', async ({ page }) => {
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Fitting Room$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('fitting-character')).toBeVisible();
  await expect(page.getByTestId('fitting-plate')).toBeVisible();
  await expect(page.getByTestId('fitting-kit-strip')).toBeVisible();
  await expect(page.getByRole('button', { name: /Queue try-on/i })).toBeVisible();
});

test('day planner happy path chrome loads', async ({ page }) => {
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Day Planner$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('day-character')).toBeVisible();
  await expect(page.getByTestId('day-slots')).toBeVisible();
  await expect(page.getByTestId('day-slot-queue')).toBeVisible();
  await expect(page.getByTestId('day-reel')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cut film/i })).toBeVisible();
});

test('moodboard look extract controls load', async ({ page }) => {
  await gotoStable(page, '/moodboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /Moodboard/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('moodboard-character')).toBeVisible();
  await expect(page.getByTestId('moodboard-tiles')).toBeVisible();
  await expect(page.getByTestId('moodboard-extract-look')).toBeVisible();
  await expect(page.getByRole('button', { name: /Use in Fitting/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Use in Day/i })).toBeVisible();
});

test('look pack deep link stages Fitting from=look handoff', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/fitting?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Fitting Room$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('fitting-kit-strip')).toBeVisible();
});

test('plugins page separates runtime plugins from bookmarks', async ({ page }) => {
  await gotoStable(page, '/plugins');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Plugins$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: /^Runtime plugins$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Sidebar bookmarks$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Custom bookmarks \(JSON\)/i })).toBeVisible();
});
