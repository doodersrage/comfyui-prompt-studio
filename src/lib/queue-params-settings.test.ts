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
