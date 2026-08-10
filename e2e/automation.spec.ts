import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';

test.describe('Settings automation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('automation hub and scheduled batch controls render', async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: 'Automation hub' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scheduled batch' })).toBeVisible();
    await expect(page.getByLabel('Enable browser scheduled batch')).toBeVisible();
    await expect(page.getByLabel(/Best-of-N ranking/i)).toBeVisible();
  });

  test('webhook settings section is reachable', async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    await expect(page.getByLabel('Enable webhooks')).toBeVisible();
  });
});
