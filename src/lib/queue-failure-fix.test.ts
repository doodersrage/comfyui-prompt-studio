import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveQueueFailureFixes } from './queue-failure-fix';

describe('resolveQueueFailureFixes', () => {
  it('offers drop-loras when the error mentions LoRA', () => {
    const fixes = resolveQueueFailureFixes({
      statusMessage: 'LoRA file not found: style.safetensors',
      sessionActiveLoraIds: ['style'],
      queueQualityProfile: 'final',
      comfyUrl: 'http://127.0.0.1:8188',
    });
    assert.ok(fixes.some(fix => fix.kind === 'drop-loras'));
  });

  it('offers Max→Final on OOM', () => {
    const fixes = resolveQueueFailureFixes({
      statusMessage: 'CUDA out of memory',
      queueQualityProfile: 'max',
      comfyUrl: 'http://127.0.0.1:8188',
    });
    assert.ok(fixes.some(fix => fix.kind === 'downgrade-quality'));
  });

  it('offers pool failover for a dead host when a pool exists', () => {
    const fixes = resolveQueueFailureFixes(
      {
        statusMessage: 'ECONNREFUSED 127.0.0.1:8188',
        comfyUrl: 'http://127.0.0.1:8188',
      },
      ['http://127.0.0.1:8188', 'http://127.0.0.1:8189']
    );
    assert.ok(fixes.some(fix => fix.kind === 'pool-failover'));
  });

  it('offers loader remap for missing checkpoint files', () => {
    const fixes = resolveQueueFailureFixes({
      statusMessage: 'Checkpoint loader filename not found in inventory',
      comfyUrl: 'http://127.0.0.1:8188',
    });
    assert.ok(fixes.some(fix => fix.kind === 'remap-loader'));
  });
});
