import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveIdentityLockApiUrl } from './identity-lock-host';

describe('resolveIdentityLockApiUrl', () => {
  it('pins to the upload host when a face filename is set', () => {
    assert.equal(
      resolveIdentityLockApiUrl({
        ipAdapterImageFilename: 'face.png',
        ipAdapterComfyUrl: 'http://127.0.0.1:8188',
      }),
      'http://127.0.0.1:8188'
    );
  });

  it('does not pin when the face is cleared', () => {
    assert.equal(
      resolveIdentityLockApiUrl({
        ipAdapterImageFilename: '',
        ipAdapterComfyUrl: 'http://127.0.0.1:8188',
      }),
      undefined
    );
  });

  it('does not pin when the host is missing', () => {
    assert.equal(
      resolveIdentityLockApiUrl({
        ipAdapterImageFilename: 'face.png',
        ipAdapterComfyUrl: '  ',
      }),
      undefined
    );
  });
});
