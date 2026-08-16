import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  FAL_I2V_MODEL_PRESETS,
  FAL_T2V_MODEL_PRESETS,
} from './engine/capabilities';
import {
  falVideoDurationPayload,
  falVideoRequiresFirstFrame,
  inferVideoClipMode,
  normalizeVideoClipMode,
  resolveFalVideoModel,
  resolveReplicateVideoModel,
  snapFalVideoDurationSec,
} from './video-clip-mode';

describe('video clip mode', () => {
  it('normalizes aliases and defaults to T2V', () => {
    assert.equal(normalizeVideoClipMode('I2V'), 'i2v');
    assert.equal(normalizeVideoClipMode('image-to-video'), 'i2v');
    assert.equal(normalizeVideoClipMode('extend'), 'i2v');
    assert.equal(normalizeVideoClipMode('continue'), 'i2v');
    assert.equal(normalizeVideoClipMode('t2v'), 't2v');
    assert.equal(normalizeVideoClipMode(''), 't2v');
  });

  it('infers I2V from a first frame only when mode is unset', () => {
    assert.equal(inferVideoClipMode({ hasInitImage: true }), 'i2v');
    assert.equal(inferVideoClipMode({ hasInitImage: false }), 't2v');
    assert.equal(inferVideoClipMode({ clipMode: 't2v', hasInitImage: true }), 't2v');
  });

  it('picks Fal T2V vs I2V model ids', () => {
    assert.equal(
      resolveFalVideoModel({ clipMode: 'i2v' }),
      DEFAULT_FAL_I2V_MODEL
    );
    assert.equal(
      resolveFalVideoModel({ clipMode: 't2v' }),
      DEFAULT_FAL_T2V_MODEL
    );
    assert.equal(
      resolveFalVideoModel({
        clipMode: 't2v',
        t2vModel: 'fal-ai/wan/v2.7/text-to-video',
      }),
      'fal-ai/wan/v2.7/text-to-video'
    );
    assert.equal(falVideoRequiresFirstFrame('i2v'), true);
    assert.equal(falVideoRequiresFirstFrame('t2v'), false);
  });

  it('picks Replicate T2V vs I2V model ids', () => {
    assert.equal(
      resolveReplicateVideoModel({ clipMode: 'i2v' }),
      DEFAULT_REPLICATE_I2V_MODEL
    );
    assert.equal(
      resolveReplicateVideoModel({ clipMode: 't2v' }),
      DEFAULT_REPLICATE_T2V_MODEL
    );
    assert.equal(
      resolveReplicateVideoModel({
        clipMode: 't2v',
        t2vModel: 'wan-video/wan-2.2-t2v-fast',
      }),
      'wan-video/wan-2.2-t2v-fast'
    );
  });

  it('snaps Fal clip length to 5s or 10s', () => {
    assert.equal(snapFalVideoDurationSec(undefined), 5);
    assert.equal(snapFalVideoDurationSec(4), 5);
    assert.equal(snapFalVideoDurationSec(7.9), 5);
    assert.equal(snapFalVideoDurationSec(8), 10);
    assert.equal(snapFalVideoDurationSec(16), 10);
  });

  it('shapes Fal duration for Kling, LTX, Grok, and Veo', () => {
    assert.equal(falVideoDurationPayload('fal-ai/kling-video/v3/standard/image-to-video', 5), '5');
    assert.equal(falVideoDurationPayload('fal-ai/kling-video/v3/standard/image-to-video', 10), '10');
    assert.equal(falVideoDurationPayload('fal-ai/ltx-2.3/image-to-video', 5), 6);
    assert.equal(falVideoDurationPayload('fal-ai/ltx-2.3/text-to-video', 10), 10);
    assert.equal(falVideoDurationPayload('xai/grok-imagine-video/v1.5/image-to-video', 5), 6);
    assert.equal(falVideoDurationPayload('fal-ai/veo3.1/image-to-video', 5), '6s');
    assert.equal(falVideoDurationPayload('fal-ai/veo3.1', 10), '8s');
  });

  it('lists documented Fal LTX, Grok Imagine, and Veo clip presets', () => {
    const i2v = FAL_I2V_MODEL_PRESETS.map(preset => preset.id);
    const t2v = FAL_T2V_MODEL_PRESETS.map(preset => preset.id);
    assert.ok(i2v.includes('fal-ai/ltx-2.3/image-to-video'));
    assert.ok(t2v.includes('fal-ai/ltx-2.3/text-to-video'));
    assert.ok(i2v.includes('xai/grok-imagine-video/v1.5/image-to-video'));
    assert.ok(t2v.includes('xai/grok-imagine-video/v1.5/text-to-video'));
    assert.ok(i2v.includes('fal-ai/veo3.1/image-to-video'));
    assert.ok(t2v.includes('fal-ai/veo3.1'));
  });
});
