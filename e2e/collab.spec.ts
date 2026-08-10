import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';

test.describe('Shared-project collab', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('collab presence bar renders on Generate', async ({ page }) => {
    await gotoStable(page, '/');
    await expect(page.getByText(/Live ·/)).toBeVisible();
  });

  test('collab presence bar renders on Compose', async ({ page }) => {
    await gotoStable(page, '/compose');
    await expect(page.getByText(/Live ·/)).toBeVisible();
  });
});
