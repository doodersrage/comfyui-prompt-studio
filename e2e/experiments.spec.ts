import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';

test.describe('Studio experiments', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('experiments tab renders dashboard', async ({ page }) => {
    await gotoStable(page, '/studio?tab=experiments');
    await expect(page.getByRole('heading', { name: 'Experiment dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh experiments' })).toBeVisible();
  });
});
