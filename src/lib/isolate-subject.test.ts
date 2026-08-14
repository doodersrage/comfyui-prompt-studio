import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectIsolateSourceUrls,
  compositeRgbaOnFill,
  ISOLATE_FILL_WHITE,
  normalizeIsolateSubject,
} from './isolate-subject';

describe('isolate-subject', () => {
  it('keeps opaque pixels and fills fully transparent pixels with white', () => {
    const src = new Uint8ClampedArray([
      10, 20, 30, 255, 40, 50, 60, 0,
    ]);
    const out = compositeRgbaOnFill(src);
    assert.equal(out[0], 10);
    assert.equal(out[1], 20);
    assert.equal(out[2], 30);
    assert.equal(out[3], 255);
    assert.equal(out[4], ISOLATE_FILL_WHITE.r);
    assert.equal(out[5], ISOLATE_FILL_WHITE.g);
    assert.equal(out[6], ISOLATE_FILL_WHITE.b);
    assert.equal(out[7], 255);
  });

  it('blends semi-transparent pixels onto white', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 128]);
    const out = compositeRgbaOnFill(src);
    assert.equal(out[0], Math.round(255 * (1 - 128 / 255)));
    assert.equal(out[1], out[0]);
    assert.equal(out[2], out[0]);
    assert.equal(out[3], 255);
  });

  it('defaults isolate on unless explicitly disabled', () => {
    assert.equal(normalizeIsolateSubject(undefined), true);
    assert.equal(normalizeIsolateSubject(true), true);
    assert.equal(normalizeIsolateSubject(false), false);
    assert.equal(normalizeIsolateSubject('false'), false);
    assert.equal(normalizeIsolateSubject(0), false);
  });

  it('collects identity and Comfy view URLs for an already-uploaded photo', () => {
    const urls = collectIsolateSourceUrls({
      imageUrl: 'blob:http://localhost/1',
      filename: 'sam.png',
      comfyUrl: 'http://127.0.0.1:8188',
    });
    assert.deepEqual(urls, [
      'blob:http://localhost/1',
      '/api/gallery/media/identity',
      '/api/comfyui/view?filename=sam.png&subfolder=&type=input&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188',
      '/api/comfyui/view?filename=sam.png&subfolder=&type=output&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188',
    ]);
  });
});
