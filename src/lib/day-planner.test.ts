import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDaySlotPrompt,
  DEFAULT_DAY_SLOTS,
  normalizeDaySlots,
} from './day-planner';

describe('day-planner', () => {
  it('normalizeDaySlots always returns four slots', () => {
    const slots = normalizeDaySlots([{ id: 'morning', label: 'Morning', sceneHints: 'coffee run' }]);
    assert.equal(slots.length, 4);
    assert.equal(slots[0]?.sceneHints, 'coffee run');
    assert.equal(slots[1]?.id, 'afternoon');
  });

  it('buildDaySlotPrompt includes slot label and beat', () => {
    const slot = DEFAULT_DAY_SLOTS[0]!;
    const prompt = buildDaySlotPrompt({
      slot: { ...slot, sceneHints: 'quiet breakfast', location: 'sunny kitchen' },
      wardrobeLabel: 'linen set',
      characterName: 'Rin',
      notes: 'cozy autumn',
    });
    assert.match(prompt, /morning/i);
    assert.match(prompt, /Rin/);
    assert.match(prompt, /linen set/);
    assert.match(prompt, /quiet breakfast/);
    assert.match(prompt, /cozy autumn/);
  });
});
