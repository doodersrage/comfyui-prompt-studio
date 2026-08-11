import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeGalleryWorkflowRetentionDays,
  pruneStaleGalleryWorkflowJson,
  stripGalleryWorkflowJsonForExport,
} from './gallery-workflow-hygiene';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

function entry(partial: Partial<ComfyGalleryEntry>): ComfyGalleryEntry {
  return {
    id: partial.id ?? '1',
    promptId: 'p',
    prompt: 'x',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: partial.queuedAt ?? Date.now(),
    images: [],
    ...partial,
  };
}

describe('gallery-workflow-hygiene', () => {
  it('normalizes retention days', () => {
    assert.equal(normalizeGalleryWorkflowRetentionDays(-1), 0);
    assert.equal(normalizeGalleryWorkflowRetentionDays(400), 365);
    assert.equal(normalizeGalleryWorkflowRetentionDays(undefined), 30);
  });

  it('prunes stale graphs and strips export bodies', () => {
    const old = entry({
      id: 'old',
      queuedAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
      workflowJson: '{"1":{}}',
      hasStoredWorkflow: true,
    });
    const fresh = entry({
      id: 'fresh',
      queuedAt: Date.now(),
      workflowJson: '{"2":{}}',
      hasStoredWorkflow: true,
    });
    const { entries, pruned } = pruneStaleGalleryWorkflowJson([old, fresh], 30);
    assert.equal(pruned, 1);
    assert.equal(entries[0]?.workflowJson, undefined);
    assert.equal(entries[0]?.workflowJsonOmitted, true);
    assert.ok(entries[1]?.workflowJson);

    const stripped = stripGalleryWorkflowJsonForExport(fresh);
    assert.equal(stripped.workflowJson, undefined);
    assert.equal(stripped.hasStoredWorkflow, true);
  });
});
