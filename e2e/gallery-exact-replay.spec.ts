import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureStudioWorkspace } from './helpers/gallery';
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
  await ensureStudioWorkspace(page);
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
  await page.route(/\/api\/comfyui(?:\/|\?|$)/, async route => {
    const method = route.request().method();
    let path = route.request().url();
    try {
      path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    } catch {
      // keep raw url
    }

    if (method === 'POST' && path === '/api/comfyui') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          promptId: 'e2e-replayed-prompt',
          comfyUrl: 'http://127.0.0.1:8188',
        }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/comfyui/preview') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          workflowSource: 'minimal',
          replacements: { positive: 1, negative: 0, params: {} },
          preflightIssues: [{ severity: 'warn', message: 'e2e preview' }],
          workflowJson: EXACT_REPLAY_FIXTURE.workflowJson,
        }),
      });
      return;
    }

    if (path === '/api/comfyui/object-info' || path.startsWith('/api/comfyui/object-info')) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'e2e: skip live object_info' }),
      });
      return;
    }

    await route.continue();
  });

  await seedExactReplayEntry(page);
  await gotoStable(page, '/gallery');
  await seedExactReplayEntry(page);
  await page.reload();
  await dismissBlockingOverlays(page);

  await expect(page.getByRole('heading', { name: /^Gallery$/i, level: 1 })).toBeVisible();
  await expect(page.getByText(/Exact graph|Graph pruned/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const menu = page.getByTestId('gallery-card-menu').first();
  await expect(menu).toBeAttached({ timeout: 10_000 });
  await menu.click({ force: true });
  const replay = page.getByTestId('gallery-replay-exact');
  await expect(replay).toBeVisible({ timeout: 10_000 });
  await replay.click();

  await expect
    .poll(async () => (await page.getByTestId('gallery-requeue-status').textContent()) ?? '', {
      timeout: 15_000,
    })
    .toMatch(/queued|Replaying|Re-queueing|prompt_id|e2e-replayed|Queueing|Validating/i);
});
