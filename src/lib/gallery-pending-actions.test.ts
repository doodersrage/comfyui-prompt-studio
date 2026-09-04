import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumePendingRefineAfterUpscale,
  scheduleRefineAfterUpscaleComplete,
} from './gallery-pending-actions';

describe('gallery-pending-actions', () => {
  it('returns undefined when nothing was scheduled for a promptId', () => {
    assert.equal(consumePendingRefineAfterUpscale('never-scheduled'), undefined);
  });

  it('round-trips a scheduled refine and consumes it exactly once', () => {
    scheduleRefineAfterUpscaleComplete('prompt-1', 'final');
    const first = consumePendingRefineAfterUpscale('prompt-1');
    assert.deepEqual(first, { qualityProfile: 'final' });
    // Consuming again returns undefined — get-then-delete semantics.
    assert.equal(consumePendingRefineAfterUpscale('prompt-1'), undefined);
  });

  it('trims whitespace from the promptId on both schedule and consume', () => {
    scheduleRefineAfterUpscaleComplete('  prompt-2  ', 'max');
    assert.deepEqual(consumePendingRefineAfterUpscale('prompt-2'), {
      qualityProfile: 'max',
    });
  });

  it('no-ops scheduling for a blank promptId', () => {
    scheduleRefineAfterUpscaleComplete('   ', 'final');
    assert.equal(consumePendingRefineAfterUpscale(''), undefined);
    assert.equal(consumePendingRefineAfterUpscale('   '), undefined);
  });

  it('keeps independent entries for different promptIds', () => {
    scheduleRefineAfterUpscaleComplete('a', 'final');
    scheduleRefineAfterUpscaleComplete('b', 'max');
    assert.deepEqual(consumePendingRefineAfterUpscale('b'), { qualityProfile: 'max' });
    assert.deepEqual(consumePendingRefineAfterUpscale('a'), { qualityProfile: 'final' });
  });

  it('overwrites a previously scheduled entry for the same promptId', () => {
    scheduleRefineAfterUpscaleComplete('c', 'final');
    scheduleRefineAfterUpscaleComplete('c', 'max');
    assert.deepEqual(consumePendingRefineAfterUpscale('c'), { qualityProfile: 'max' });
  });
});
