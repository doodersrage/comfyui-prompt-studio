import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
} from './engine/capabilities';
import {
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
});
