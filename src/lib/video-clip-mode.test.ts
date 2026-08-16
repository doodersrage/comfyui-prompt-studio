import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
} from './engine/capabilities';
import {
  falVideoRequiresFirstFrame,
  inferVideoClipMode,
  normalizeVideoClipMode,
  resolveFalVideoModel,
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
});
