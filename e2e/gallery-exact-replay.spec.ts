import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';

const EXACT_REPLAY_FIXTURE = {
  id: 'e2e-exact-replay',
  promptId: 'e2e-exact-prompt',
  prompt: 'exact replay fixture',
  model: 'qwen-image-2512',
  tool: 'generate',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'completed',
  queuedAt: Date.now(),
  completedAt: Date.now(),
  hasStoredWorkflow: true,
  workflowJson: JSON.stringify({
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
  }),
  images: [{ filename: 'e2e-exact.png', subfolder: '', type: 'output' }],
};

async function seedExactReplayEntry(page: import('@playwright/test').Page) {
  await page.addInitScript(entry => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify([entry]));
    } catch {
      // ignore
    }
  }, EXACT_REPLAY_FIXTURE);

  await page.evaluate(async entry => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify([entry]));
    } catch {
      // ignore
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('comfy-prompt-studio-v1');
      request.onerror = () => reject(request.error ?? new Error('idb open failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('galleryEntries')) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction('galleryEntries', 'readwrite');
        tx.objectStore('galleryEntries').put(entry);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
      };
    });

    window.dispatchEvent(new Event('comfyui-gallery-updated'));
  }, EXACT_REPLAY_FIXTURE);
}

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('gallery replay exact graph queues via mocked Comfy API', async ({ page }) => {
  await page.route('**/api/comfyui', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        promptId: 'e2e-replayed-prompt',
        comfyUrl: 'http://127.0.0.1:8188',
      }),
    });
  });

  await seedExactReplayEntry(page);
  await gotoStable(page, '/gallery');
  await seedExactReplayEntry(page);
  await page.reload();
  await dismissBlockingOverlays(page);

  await expect(page.getByRole('heading', { name: /ComfyUI Gallery/i })).toBeVisible();
  await expect(page.getByText(/Exact graph|Graph pruned/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const replay = page.getByTestId('gallery-replay-exact');
  if (!(await replay.isVisible().catch(() => false))) {
    const menu = page.getByTestId('gallery-card-menu').first();
    await expect(menu).toBeVisible({ timeout: 10_000 });
    await menu.click();
  }

  await expect(page.getByTestId('gallery-replay-exact')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('gallery-replay-exact').click();

  await expect(page.getByText(/queued|Replaying|prompt_id|e2e-replayed/i).first()).toBeVisible({
    timeout: 15_000,
  });
});
