import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedGalleryLightboxFixtures } from './helpers/gallery';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('lightbox opens, rates, expands actions, and navigates', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  await expect(page.getByTestId('gallery-card-review-note').first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Open image preview' }).first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });

  await lightbox.getByRole('button', { name: '3★' }).click();
  await expect(lightbox.getByRole('button', { name: '3★' })).toBeVisible();

  const actionsToggle = lightbox.getByTestId('lightbox-actions-toggle');
  await actionsToggle.click();
  await expect(lightbox.getByTestId('lightbox-actions-rail')).toBeVisible();

  const next = lightbox.getByRole('button', { name: 'Next image' });
  if (await next.isEnabled()) {
    await next.click();
    await expect(lightbox.getByText(/Image 2 of/i)).toBeVisible();
    await lightbox.getByRole('button', { name: 'Previous image' }).click();
    await expect(lightbox.getByText(/Image 1 of/i)).toBeVisible();
  }

  await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(lightbox).toHaveCount(0);
});

test('gallery deep-links into lightbox via ?lightbox=', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery?lightbox=e2e-gallery-fixture');
  await dismissBlockingOverlays(page);

  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/lightbox=e2e-gallery-fixture/);
});
