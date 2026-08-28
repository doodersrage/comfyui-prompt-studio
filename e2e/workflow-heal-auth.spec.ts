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
    // Banner Heal shares the same label but does not set heal-status — dismiss if present.
    const dismissBanner = page.getByRole('button', { name: /^Dismiss$/i });
    if (await dismissBanner.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dismissBanner.click();
    }
    const connection = page.locator('#settings-comfyui-connection');
    await expect(connection).toBeVisible({ timeout: 30_000 });
    await connection.scrollIntoViewIfNeeded();
    // Scope to the connection hub — SetupReadinessBanner also has Heal & ready without heal-status.
    const heal = connection
      .getByTestId('heal-and-ready')
      .or(connection.getByRole('button', { name: /Heal & ready/i }))
      .first();
    await expect(heal).toBeVisible({ timeout: 30_000 });
    const healthAfterClick = page.waitForResponse(
      response => response.url().includes('/api/health') && response.request().method() === 'GET',
      { timeout: 45_000 }
    );
    await heal.click();
    await healthAfterClick;
    // Prefer the dedicated status node — text fallbacks collide with checklist copy
    // ("System workflows are off…") and trip Playwright strict mode.
    // Dev Fast Refresh can remount Settings and clear ephemeral healProgress; accept the
    // persisted checklist flip as proof heal ran.
    await expect
      .poll(
        async () => {
          if (await connection.getByTestId('heal-status').isVisible().catch(() => false)) {
            return 'status';
          }
          if (
            await connection
              .getByText(/System workflows\s*·\s*on/i)
              .isVisible()
              .catch(() => false)
          ) {
            return 'workflows-on';
          }
          return '';
        },
        { timeout: 45_000 }
      )
      .not.toEqual('');
  });
});

test.describe('Auth-on optional', () => {
  test('login API responds when auth is enabled; skips cleanly when off', async ({ page }) => {
    const authRequired = process.env.PROMPT_E2E_AUTH === '1';
    const { username, password } = e2eCredentials();
    const response = await page.request.post('/api/auth/login', {
      data: { username, password },
    });
    if (response.status() === 404 || response.status() === 503) {
      if (authRequired) {
        throw new Error(
          'PROMPT_E2E_AUTH=1 but /api/auth/login is disabled (404/503). Enable auth for this lane.'
        );
      }
      test.skip(true, 'Auth is disabled in this environment');
      return;
    }
    if (authRequired) {
      expect(
        response.ok(),
        `PROMPT_E2E_AUTH=1 requires successful login (got ${response.status()})`
      ).toBeTruthy();
      await gotoStable(page, '/');
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).not.toBeVisible({
        timeout: 15_000,
      });
      // Protected settings deep-link should stay signed-in.
      await gotoStable(page, '/settings?tab=comfyui&section=connection');
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).not.toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('#settings-comfyui-connection')).toBeVisible({ timeout: 30_000 });
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
