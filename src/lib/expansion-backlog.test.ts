import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessGalleryCapWarning } from './gallery-cap';
import { clampScheduledBatchConfig, DEFAULT_SCHEDULED_BATCH } from './scheduled-batch';
import { formatDiffusersClassifyHint } from './diffusers-workflow-support';

describe('assessGalleryCapWarning', () => {
  it('returns none below 85% of cap', () => {
    const result = assessGalleryCapWarning(4000, 5000);
    assert.equal(result.level, 'none');
  });

  it('returns notice between 85% and cap', () => {
    const result = assessGalleryCapWarning(4500, 5000);
    assert.equal(result.level, 'notice');
    assert.match(result.message ?? '', /approaching/i);
  });

  it('returns urgent at cap', () => {
    const result = assessGalleryCapWarning(5000, 5000);
    assert.equal(result.level, 'urgent');
  });
});

describe('clampScheduledBatchConfig', () => {
  it('clamps bestOfN and preserves override fields', () => {
    const result = clampScheduledBatchConfig({
      ...DEFAULT_SCHEDULED_BATCH,
      enabled: true,
      overrideSharedSettings: true,
      model: 'qwen-image-2512',
      bestOfN: 9,
      webhookAutoRetry: true,
    });
    assert.equal(result.bestOfN, 4);
    assert.equal(result.model, 'qwen-image-2512');
    assert.equal(result.webhookAutoRetry, true);
  });
});

describe('formatDiffusersClassifyHint', () => {
  it('labels native SDXL graphs', () => {
    const hint = formatDiffusersClassifyHint({
      supported: true,
      family: 'sdxl',
      reason: 'ok',
      unsupportedNodes: [],
      assets: {},
      engineUrl: 'http://127.0.0.1:8190',
    });
    assert.equal(hint.mode, 'native');
    assert.match(hint.label, /sdxl/i);
  });

  it('labels fallback with unsupported nodes', () => {
    const hint = formatDiffusersClassifyHint({
      supported: false,
      family: 'unsupported',
      reason: 'ControlNet',
      unsupportedNodes: ['ControlNetApplyAdvanced'],
      assets: {},
      engineUrl: 'http://127.0.0.1:8190',
    });
    assert.equal(hint.mode, 'fallback');
    assert.match(hint.detail, /ControlNet/i);
  });
});
