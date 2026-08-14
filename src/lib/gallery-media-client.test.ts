import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cacheBustIdentityMediaUrl, IDENTITY_MEDIA_URL } from './gallery-media-client';

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
});
