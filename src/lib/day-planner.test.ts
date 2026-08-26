import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDaySlotPrompt,
  dayWatchPlaylist,
  DEFAULT_DAY_SLOTS,
  mergeDaySlotStills,
  normalizeDaySlots,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
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

  it('dayWatchPlaylist builds Morning→Night still shots', () => {
    const stills = upsertDaySlotStill(
      upsertDaySlotStill(undefined, {
        slotId: 'morning',
        promptId: 'p1',
        status: 'completed',
        imageUrl: 'https://example.com/m.jpg',
      }),
      {
        slotId: 'night',
        promptId: 'p2',
        status: 'completed',
        imageUrl: 'https://example.com/n.jpg',
      }
    );
    const playlist = dayWatchPlaylist(stills);
    assert.equal(playlist.length, 2);
    assert.equal(playlist[0]?.title, 'Morning');
    assert.equal(playlist[1]?.title, 'Night');
    assert.equal(playlist[0]?.kind, 'still');
  });

  it('mergeDaySlotStills updates from gallery poll', () => {
    const queued = upsertDaySlotStill(undefined, {
      slotId: 'afternoon',
      promptId: 'job-9',
      status: 'queued',
    });
    const merged = mergeDaySlotStills(queued, [
      { promptId: 'job-9', status: 'completed', imageUrl: 'https://example.com/a.jpg' },
    ]);
    assert.equal(merged.changed, true);
    assert.equal(merged.stills.find(s => s.slotId === 'afternoon')?.status, 'completed');
  });

  it('seedDaySlotsWardrobe fills empty kits only', () => {
    const seeded = seedDaySlotsWardrobe(
      [{ id: 'morning', label: 'Morning', wardrobeId: 'keep-me' }],
      'new-kit'
    );
    assert.equal(seeded[0]?.wardrobeId, 'keep-me');
    assert.equal(seeded[1]?.wardrobeId, 'new-kit');
  });
});
