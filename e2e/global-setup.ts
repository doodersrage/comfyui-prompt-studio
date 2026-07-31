import { chromium, type FullConfig } from '@playwright/test';
import { e2eCredentials } from './helpers/auth';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const storagePath = resolve(__dirname, '.auth/user.json');

export default async function globalSetup(config: FullConfig): Promise<void> {
  mkdirSync(dirname(storagePath), { recursive: true });

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:47832';
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/');
  const needsLogin = await page
    .getByRole('heading', { name: 'Sign in', exact: true })
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (needsLogin) {
    const { username, password } = e2eCredentials();
    const response = await page.request.post('/api/auth/login', {
      data: { username, password },
    });
    if (!response.ok()) {
      throw new Error(`E2E global login failed (${response.status()}): ${await response.text()}`);
    }
    await page.goto('/');
  }

  // Prevent the deferred first-run welcome dialog from blocking gallery/clicks.
  await page.evaluate(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // ignore quota / private mode
    }
  });

  await context.storageState({ path: storagePath });
  await browser.close();
}
