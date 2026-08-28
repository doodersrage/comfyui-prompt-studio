import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksLikeVideoFile } from './vision-scan-still';

describe('looksLikeVideoFile', () => {
  it('detects video mime types', () => {
    assert.equal(looksLikeVideoFile(new File(['x'], 'clip.bin', { type: 'video/mp4' })), true);
  });

  it('detects video extensions on octet-stream uploads', () => {
    assert.equal(
      looksLikeVideoFile(new File(['x'], 'output.mp4', { type: 'application/octet-stream' })),
      true
    );
  });

  it('treats png uploads as stills', () => {
    assert.equal(looksLikeVideoFile(new File(['x'], 'still.png', { type: 'image/png' })), false);
  });
});
