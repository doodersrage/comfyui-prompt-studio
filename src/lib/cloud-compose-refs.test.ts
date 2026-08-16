import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLOUD_COMPOSE_SINGLE_REF_WARNING,
  cloudComposeBlocksTransfer,
  cloudComposeSendsOnlyImage1,
  extraCloudComposeFilenames,
  filledComposeExtraCount,
  isCloudMultiRefEditModel,
  isFalMultiRefEditModel,
} from './cloud-compose-refs';

describe('cloud compose refs', () => {
  it('recognizes documented Fal Kontext multi endpoints only', () => {
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-pro/kontext/multi'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux-pro/kontext/max/multi'), true);
    assert.equal(isFalMultiRefEditModel('fal-ai/flux/dev/image-to-image'), false);
    assert.equal(isCloudMultiRefEditModel('fal', 'fal-ai/flux-pro/kontext/multi'), true);
    assert.equal(isCloudMultiRefEditModel('replicate', 'fal-ai/flux-pro/kontext/multi'), false);
    assert.equal(isCloudMultiRefEditModel('replicate', 'black-forest-labs/flux-kontext-pro'), false);
    assert.equal(isCloudMultiRefEditModel('openai', 'gpt-image-2'), false);
  });

  it('keeps extra filenames only on multi-ref Fal', () => {
    const names = ['fig1.png', '', 'fig3.png', 'fig4.png'];
    assert.deepEqual(extraCloudComposeFilenames(names, 'fal', 'fal-ai/flux/dev/image-to-image'), []);
    assert.deepEqual(extraCloudComposeFilenames(names, 'fal', 'fal-ai/flux-pro/kontext/multi'), [
      'fig3.png',
      'fig4.png',
    ]);
    assert.equal(filledComposeExtraCount(names), 2);
    assert.equal(cloudComposeSendsOnlyImage1('fal', 'fal-ai/flux/dev/image-to-image'), true);
    assert.equal(cloudComposeSendsOnlyImage1('fal', 'fal-ai/flux-pro/kontext/multi'), false);
    assert.match(CLOUD_COMPOSE_SINGLE_REF_WARNING, /Image 1 only/i);
  });

  it('blocks silent Transfer on single-ref cloud', () => {
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'fal',
        modelId: 'fal-ai/flux/dev/image-to-image',
        mode: 'transfer',
        extraFilled: true,
      }),
      true
    );
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'fal',
        modelId: 'fal-ai/flux-pro/kontext/multi',
        mode: 'transfer',
        extraFilled: true,
      }),
      false
    );
    assert.equal(
      cloudComposeBlocksTransfer({
        engine: 'fal',
        modelId: 'fal-ai/flux/dev/image-to-image',
        mode: 'modify',
        extraFilled: true,
      }),
      false
    );
  });
});
