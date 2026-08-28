import { test, expect } from '@playwright/test';
import { e2eCredentials, ensureAuthenticated } from './helpers/auth';
import { seedGalleryFixture } from './helpers/gallery';
import { gotoStable, openComfyUiSettingsTab } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';

test.describe('Workflow editor', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('workflow editor chrome loads with save and queue controls', async ({ page }) => {
    await gotoStable(page, '/workflow-editor');
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('workflow-editor')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Node graph editor/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save to library/i })).toBeVisible();
    await expect(page.getByTestId('workflow-editor-queue')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Dry-run$/i })).toBeVisible();
  });
});

test.describe('Heal failure path', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('Heal & ready keeps a status message when Comfy health fails', async ({ page }) => {
    await page.route('**/api/health**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          llm: { ok: false, error: 'unreachable' },
          comfyui: { ok: false, error: 'ECONNREFUSED' },
        }),
      });
    });
    await page.route('**/api/settings**', async route => {
      if (route.request().method() === 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoStable(page, '/settings?tab=comfyui&section=connection');
    await openComfyUiSettingsTab(page);
    const heal = page.getByRole('button', { name: /Heal & ready/i }).first();
    await expect(heal).toBeVisible({ timeout: 30_000 });
    await heal.click();
    // Status persists after heal finishes (connection first-run or overview).
    const status = page.getByTestId('heal-status').or(page.getByText(/ComfyUI unreachable|Heal failed|LLM not ready|system workflows/i).first());
    await expect(status).toBeVisible({ timeout: 45_000 });
  });
});

test.describe('Auth-on optional', () => {
  test('login API responds when auth is enabled; skips cleanly when off', async ({ page }) => {
    const { username, password } = e2eCredentials();
    const response = await page.request.post('/api/auth/login', {
      data: { username, password },
    });
    if (response.status() === 404 || response.status() === 503) {
      test.skip(true, 'Auth is disabled in this environment');
      return;
    }
    if (process.env.PROMPT_E2E_AUTH === '1') {
      expect(response.ok()).toBeTruthy();
      await gotoStable(page, '/');
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).not.toBeVisible({
        timeout: 15_000,
      });
      return;
    }
    // Default LAN: route may accept admin seed or reject — either proves auth surface exists.
    expect([200, 400, 401]).toContain(response.status());
  });
});

test.describe('Play dogfood glue', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('dashboard metrics empty state points at Play and Heal', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('comfy-play-metrics-v1');
        localStorage.removeItem('comfy-local-observability-v1');
        localStorage.removeItem('play-campaign-v1');
      } catch {
        // ignore
      }
    });
    await gotoStable(page, '/dashboard');
    await dismissBlockingOverlays(page);
    await page.evaluate(() => {
      try {
        localStorage.removeItem('comfy-play-metrics-v1');
        localStorage.removeItem('comfy-local-observability-v1');
        localStorage.removeItem('play-campaign-v1');
      } catch {
        // ignore
      }
    });
    await page.reload();
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('play-film-metrics')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('play-metrics-empty')).toBeVisible();
    await expect(page.getByTestId('play-next-cta')).toBeVisible();
    await expect(page.getByTestId('play-funnel-steps')).toBeVisible();
    await expect(page.getByTestId('play-metrics-heal')).toBeVisible();
  });

  test('seeded still + campaign metrics CTA resumes Day cut path', async ({ page }) => {
    await seedGalleryFixture(page);
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'comfy-play-metrics-v1',
          JSON.stringify({ version: 1, firstPlayCampaignAt: Date.now() - 60_000 })
        );
        localStorage.setItem(
          'comfy-local-observability-v1',
          JSON.stringify({
            version: 1,
            firstPlayCampaign: 1,
            firstFilmCut: 0,
            keepTryOn: 1,
            campaignMaxStep: 3,
          })
        );
        localStorage.setItem(
          'play-campaign-v1',
          JSON.stringify({
            version: 1,
            characterId: 'e2e-dogfood',
            stepIndex: 3,
            updatedAt: Date.now(),
          })
        );
      } catch {
        // ignore
      }
    });
    await gotoStable(page, '/dashboard');
    await dismissBlockingOverlays(page);
    await page.evaluate(() => {
      try {
        localStorage.setItem(
          'comfy-play-metrics-v1',
          JSON.stringify({ version: 1, firstPlayCampaignAt: Date.now() - 60_000 })
        );
        localStorage.setItem(
          'comfy-local-observability-v1',
          JSON.stringify({
            version: 1,
            firstPlayCampaign: 1,
            firstFilmCut: 0,
            keepTryOn: 1,
            campaignMaxStep: 3,
          })
        );
        localStorage.setItem(
          'play-campaign-v1',
          JSON.stringify({
            version: 1,
            characterId: 'e2e-dogfood',
            stepIndex: 3,
            updatedAt: Date.now(),
          })
        );
        window.dispatchEvent(new Event('play-metrics-updated'));
      } catch {
        // ignore
      }
    });
    await page.reload();
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('play-film-metrics')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('play-next-cta')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('play-funnel-step-day')).toHaveAttribute('data-active', 'true');
    const href = await page.getByTestId('play-next-cta').getAttribute('href');
    expect(href).toMatch(/\/day/);
  });
});
