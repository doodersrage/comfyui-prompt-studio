import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cacheBustIdentityMediaUrl,
  IDENTITY_MEDIA_URL,
  isIdentityMediaUrl,
} from './gallery-media-client';

describe('cacheBustIdentityMediaUrl', () => {
  it('appends v= to the identity lock URL', () => {
    const next = cacheBustIdentityMediaUrl(IDENTITY_MEDIA_URL);
    assert.match(next, /^\/api\/gallery\/media\/identity\?v=\d+$/);
  });

  it('replaces an existing v= so the src actually changes', () => {
    const first = cacheBustIdentityMediaUrl(`${IDENTITY_MEDIA_URL}?v=1`);
    const params = new URLSearchParams(first.split('?')[1] ?? '');
    assert.notEqual(params.get('v'), '1');
    assert.match(params.get('v') ?? '', /^\d+$/);
  });

  it('leaves non-identity URLs alone', () => {
    assert.equal(cacheBustIdentityMediaUrl('/api/gallery/media/abc'), '/api/gallery/media/abc');
    assert.equal(cacheBustIdentityMediaUrl('blob:http://localhost/1'), 'blob:http://localhost/1');
  });

  it('detects the identity lock path with or without a cache-bust query', () => {
    assert.equal(isIdentityMediaUrl(IDENTITY_MEDIA_URL), true);
    assert.equal(isIdentityMediaUrl(`${IDENTITY_MEDIA_URL}?v=9`), true);
    assert.equal(isIdentityMediaUrl('/api/gallery/media/abc'), false);
  });
});
