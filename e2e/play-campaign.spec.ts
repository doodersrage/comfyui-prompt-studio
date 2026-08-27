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
  const advanced = page.locator('summary', { hasText: /Advanced: manage bookmarks/i });
  await expect(advanced).toBeVisible();
  await advanced.click();
  await expect(page.getByRole('heading', { name: /Add custom bookmark/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Custom bookmarks \(JSON\)/i })).toBeVisible();
});

test('play campaign continue CTA appears when campaign state exists', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-continue')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-start-moodboard')).toContainText(/Restart/i);
});


test('look pack from=look applies notes into Fitting', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      vibePrompt: 'golden hour soft light',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/fitting?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Fitting Room$/i })).toBeVisible({
    timeout: 30_000,
  });
  const notes = page.getByTestId('fitting-notes');
  if (await notes.count()) {
    await expect(notes).toContainText(/golden hour|cozy morning|sunlit kitchen/i);
  }
});

test('look pack from=look seeds Day slot location', async ({ page }) => {
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
  await gotoStable(page, '/day?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Day Planner$/i })).toBeVisible({
    timeout: 30_000,
  });
  const location = page.getByTestId('day-slot-location');
  if (await location.count()) {
    await expect(location).toHaveValue(/sunlit kitchen/i);
  }
});

test('play campaign continue navigates to Fitting step', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  const continueBtn = page.getByTestId('play-campaign-continue');
  await expect(continueBtn).toBeVisible({ timeout: 30_000 });
  await continueBtn.click();
  await expect(page).toHaveURL(/\/fitting/, { timeout: 30_000 });
});

test('portable look pack share hash is accepted on /play', async ({ page }) => {
  const token = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: 'prompt-studio-look-pack',
      name: 'E2E share',
      id: 'lp-e2e',
      pack: {
        version: 1,
        source: 'moodboard',
        locationNotes: 'hash rooftop',
        moodNotes: 'night air',
        wardrobeId: 'kit-linen',
        savedAt: Date.now(),
      },
    }),
    'utf8'
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  page.once('dialog', async dialog => {
    await dialog.accept('E2E Shared Cast');
  });
  await gotoStable(page, `/play#lookpack=${token}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/share link|Imported shared|Created Cast/i)).toBeVisible({
    timeout: 30_000,
  });
});

test('play campaign resume restores lookPack query from saved campaign', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'saved',
      characterId: 'e2e-resume-char',
      locationNotes: 'resume kitchen',
      savedAt: Date.now(),
    };
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-resume-char',
            name: 'E2E Resume',
            version: 1,
            updatedAt: Date.now(),
            lookPacks: [{ id: 'lp-resume', name: 'Resume pack', savedAt: Date.now(), pack }],
          },
        ],
        removedIds: [],
      })
    );
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        lookPackId: 'lp-resume',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page).toHaveURL(/lookPack=lp-resume/, { timeout: 30_000 });
  await expect(page.getByText(/look pack staged/i)).toBeVisible({ timeout: 30_000 });
});

test('play campaign shows mismatch when saved character differs', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-other-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-resume-mismatch')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-continue')).toHaveCount(0);
});

test('play metrics card appears on dashboard when metrics exist', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstPlayCampaignAt: Date.now() - 86_400_000,
        firstFilmCutAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-film-metrics')).toBeVisible({ timeout: 30_000 });
});

test('copy share link button copies portable hash url', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      locationNotes: 'copy rooftop',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  const copyBtn = page.getByTestId('play-campaign-share-copy');
  await expect(copyBtn).toBeVisible({ timeout: 30_000 });
  await copyBtn.click();
  await expect(page.getByText(/Share link copied/i)).toBeVisible({ timeout: 10_000 });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/#lookpack=/);
});
