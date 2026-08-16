import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFalExtendParentUrl } from './fal-extend-upload';

describe('fal extend upload', () => {
  it('returns a public Fal clip URL without uploading', async () => {
    const url = 'https://v3b.fal.media/files/clip.mp4';
    assert.equal(await resolveFalExtendParentUrl({ parentUrl: url }), url);
  });

  it('returns null when there is no parent clip', async () => {
    assert.equal(await resolveFalExtendParentUrl({}), null);
  });

  it('falls back to null when a local clip cannot be uploaded', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      assert.equal(
        await resolveFalExtendParentUrl({
          parentUrl: '/api/comfyui/view?filename=clip.mp4',
        }),
        null
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
