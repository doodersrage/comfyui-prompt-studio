import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nodeDistForTarget, sidecarBinaryName } from './targets.mjs';

describe('desktop node sidecar targets', () => {
  it('maps common rust triples to official Node distros', () => {
    assert.equal(nodeDistForTarget('x86_64-unknown-linux-gnu').platform, 'linux');
    assert.equal(nodeDistForTarget('aarch64-apple-darwin').arch, 'arm64');
    assert.equal(sidecarBinaryName('x86_64-pc-windows-msvc'), 'node-x86_64-pc-windows-msvc.exe');
    assert.equal(sidecarBinaryName('aarch64-apple-darwin'), 'node-aarch64-apple-darwin');
  });
});
