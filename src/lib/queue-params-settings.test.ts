import assert from 'node:assert/strict';
import test from 'node:test';

test('forceNewSeed ignores handoff/base seed and rolls fresh values', async () => {
  const { resolveQueueParams, rollQueueSeed } = await import('./queue-params-settings');

  const handoffSeed = '424242';
  const first = resolveQueueParams({
    base: { seed: handoffSeed },
    forceNewSeed: true,
  });
  const second = resolveQueueParams({
    base: { seed: handoffSeed },
    forceNewSeed: true,
  });

  assert.notEqual(first.seed, handoffSeed);
  assert.notEqual(second.seed, handoffSeed);
  assert.notEqual(first.seed, second.seed);
  assert.match(String(first.seed), /^\d+$/);
  assert.match(rollQueueSeed(), /^\d+$/);
});

test('without forceNewSeed, base seed is reused', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    base: { seed: '7777777' },
  });
  assert.equal(params.seed, '7777777');
});

test('figurePixelSize overrides handoff W×H for Compose Lightning I2I', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  const params = resolveQueueParams({
    model: 'qwen-image-edit-2511-lightning-8',
    tool: 'compose',
    base: { width: '1104', height: '1472', seed: '1' },
    inputImageFilename: 'fig.png',
    figurePixelSize: { width: 682, height: 1024 },
  });

  assert.equal(params.width, 1056);
  assert.equal(params.height, 1584);
});

test('Klein Distilled Compose/Refine snaps figure pixels to native portrait', async () => {
  const { resolveQueueParams } = await import('./queue-params-settings');

  for (const tool of ['compose', 'refine'] as const) {
    const params = resolveQueueParams({
      model: 'flux-2-klein-9b-distilled',
      tool,
      base: { width: '1024', height: '1024', seed: '1' },
      inputImageFilename: 'fig.png',
      figurePixelSize: { width: 682, height: 1024 },
    });

    assert.equal(params.width, 896, tool);
    assert.equal(params.height, 1152, tool);
  }
});
