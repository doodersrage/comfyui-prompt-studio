import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable, revealFullSettings } from './helpers/navigation';

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
    await expect(page.getByText(/Vision-rank queued outputs/i)).toBeVisible();
  });

  test('webhook settings section is reachable', async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    await expect(page.getByLabel('Enable webhooks')).toBeVisible();
  });

  test('vision-rank checkbox toggles when best-of-N is set', async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await revealFullSettings(page);
    const bestOfN = page.getByLabel(/Best-of-N ranking/i);
    await bestOfN.selectOption('3');
    // Vision-rank stays disabled until auto-queue is on.
    const autoQueue = page.getByLabel(/Auto-queue to ComfyUI/i);
    await autoQueue.check();
    const vision = page.getByLabel(/Vision-rank queued outputs/i);
    await expect(vision).toBeEnabled({ timeout: 10_000 });
    await vision.check();
    await expect(vision).toBeChecked();
  });
});
