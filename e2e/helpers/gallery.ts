import type { Page } from '@playwright/test';

const FIXTURE = {
  id: 'e2e-gallery-fixture',
  promptId: 'e2e-prompt',
  prompt: 'e2e gallery fixture',
  model: 'qwen-image-2512',
  tool: 'topics',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'completed',
  queuedAt: Date.now(),
  completedAt: Date.now(),
  images: [{ filename: 'e2e-fixture.png', subfolder: '', type: 'output' }],
};

/** Ensure Studio workspace so advanced Filters / layout chips render (hidden in Simple). */
export async function ensureStudioWorkspace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // ignore quota / private mode
    }
  });
  await page.evaluate(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // ignore
    }
  });
}

/** Seed one completed gallery entry so selection-bar e2e can run on empty CI stores. */
export async function seedGalleryFixture(page: Page): Promise<void> {
  await ensureStudioWorkspace(page);
  await page.addInitScript(entry => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify([entry]));
    } catch {
      // ignore quota / private mode
    }
  }, FIXTURE);

  // Current document (after auth) also needs the fixture before navigating to gallery.
  await page.evaluate(entry => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify([entry]));
      window.dispatchEvent(new Event('comfyui-gallery-updated'));
    } catch {
      // ignore
    }
  }, FIXTURE);
}
