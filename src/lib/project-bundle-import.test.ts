import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery';
import type { ProjectBundle } from './project-bundle';
import type { PromptHistoryEntry } from './prompt-history';

let galleryEntries: ComfyGalleryEntry[] = [];
const loadComfyGallery = mock.fn(() => galleryEntries);
const saveComfyGallery = mock.fn((entries: ComfyGalleryEntry[]) => {
  galleryEntries = entries;
});
mock.module('./comfyui-gallery', { namedExports: { loadComfyGallery, saveComfyGallery } });

let historyEntries: PromptHistoryEntry[] = [];
const loadPromptHistoryStore = mock.fn(() => historyEntries);
const savePromptHistoryStore = mock.fn((entries: PromptHistoryEntry[]) => {
  historyEntries = entries;
});
mock.module('./prompt-history', {
  namedExports: { loadPromptHistoryStore, savePromptHistoryStore, PROMPT_HISTORY_LIMIT: 500 },
});

const upsertPromptProject = mock.fn((_project: unknown) => ({}) as unknown);
mock.module('./prompt-projects', { namedExports: { upsertPromptProject } });

function resetMocks() {
  galleryEntries = [];
  historyEntries = [];
  for (const m of [
    loadComfyGallery,
    saveComfyGallery,
    loadPromptHistoryStore,
    savePromptHistoryStore,
    upsertPromptProject,
  ]) {
    m.mock.resetCalls();
  }
}

afterEach(resetMocks);

describe('project-bundle-import', async () => {
  const { importProjectBundle } = await import('./project-bundle-import');

  function bundle(overrides: Partial<ProjectBundle> = {}): ProjectBundle {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: { id: 'p1', name: 'Project 1' } as ProjectBundle['project'],
      history: [],
      gallery: [],
      scenePresets: [],
      ...overrides,
    };
  }

  it('upserts the bundled project unconditionally', () => {
    importProjectBundle(bundle());
    assert.equal(upsertPromptProject.mock.calls.length, 1);
    assert.deepEqual(upsertPromptProject.mock.calls[0]!.arguments[0], { id: 'p1', name: 'Project 1' });
  });

  it('merges new history/gallery entries ahead of existing ones and reports counts added', () => {
    historyEntries = [{ id: 'h-existing' } as PromptHistoryEntry];
    galleryEntries = [{ id: 'g-existing' } as ComfyGalleryEntry];
    const result = importProjectBundle(
      bundle({
        history: [{ id: 'h-new' } as PromptHistoryEntry, { id: 'h-existing' } as PromptHistoryEntry],
        gallery: [{ id: 'g-new' } as ComfyGalleryEntry],
      })
    );
    assert.deepEqual(result, { historyAdded: 1, galleryAdded: 1 });
    assert.deepEqual(savePromptHistoryStore.mock.calls[0]!.arguments[0], [
      { id: 'h-new' },
      { id: 'h-existing' },
    ]);
    assert.deepEqual(saveComfyGallery.mock.calls[0]!.arguments[0], [
      { id: 'g-new' },
      { id: 'g-existing' },
    ]);
  });

  it('skips every history/gallery entry that already exists by id', () => {
    historyEntries = [{ id: 'h1' } as PromptHistoryEntry];
    galleryEntries = [{ id: 'g1' } as ComfyGalleryEntry];
    const result = importProjectBundle(
      bundle({
        history: [{ id: 'h1' } as PromptHistoryEntry],
        gallery: [{ id: 'g1' } as ComfyGalleryEntry],
      })
    );
    assert.deepEqual(result, { historyAdded: 0, galleryAdded: 0 });
  });

  it('caps the merged history at PROMPT_HISTORY_LIMIT (500)', () => {
    historyEntries = Array.from({ length: 500 }, (_, i) => ({ id: `existing-${i}` }) as PromptHistoryEntry);
    const result = importProjectBundle(
      bundle({ history: [{ id: 'brand-new' } as PromptHistoryEntry] })
    );
    assert.equal(result.historyAdded, 1);
    const saved = savePromptHistoryStore.mock.calls[0]!.arguments[0] as PromptHistoryEntry[];
    assert.equal(saved.length, 500);
    assert.equal(saved[0]!.id, 'brand-new');
  });
});
