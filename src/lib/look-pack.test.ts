import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLookPackToDaySlots,
  buildLookPackFromMoodboard,
  lookPackDayHref,
  lookPackFittingHref,
  lookPackNotes,
  normalizeLookPack,
} from './look-pack';
import { DEFAULT_DAY_SLOTS } from './day-planner';

describe('look-pack', () => {
  it('buildLookPackFromMoodboard collects role notes', () => {
    const pack = buildLookPackFromMoodboard({
      characterId: 'char-1',
      templateId: 'lighting-mood',
      instruction: 'wide frame',
      vibePrompt: 'golden hour cinematic still',
      wardrobeId: 'kit-a',
      tiles: [
        { id: 't1', role: 'lighting', notes: 'soft rim light' },
        { id: 't2', role: 'location', notes: 'rainy street' },
        { id: 't3', role: 'palette', notes: 'teal and amber' },
      ],
    });
    assert.equal(pack.version, 1);
    assert.equal(pack.characterId, 'char-1');
    assert.match(pack.lightingNotes ?? '', /rim light/);
    assert.match(pack.locationNotes ?? '', /rainy/);
    assert.match(lookPackNotes(pack), /golden hour/);
    assert.match(lookPackFittingHref(pack), /from=look/);
    assert.match(lookPackFittingHref(pack), /wardrobe=kit-a/);
    assert.match(lookPackDayHref(pack), /character=char-1/);
  });

  it('normalizeLookPack rejects bad payloads', () => {
    assert.equal(normalizeLookPack(null), null);
    assert.equal(normalizeLookPack({ version: 2, source: 'moodboard' }), null);
  });

  it('applyLookPackToDaySlots seeds location and beats', () => {
    const pack = buildLookPackFromMoodboard({
      wardrobeId: 'kit-linen',
      instruction: 'cozy morning energy',
      tiles: [
        { id: 't1', role: 'location', notes: 'sunlit kitchen' },
        { id: 't2', role: 'mood', notes: 'cozy morning' },
      ],
    });
    const slots = applyLookPackToDaySlots(DEFAULT_DAY_SLOTS, pack);
    assert.equal(slots[0]?.location, 'sunlit kitchen');
    assert.match(slots[0]?.sceneHints ?? '', /cozy morning/);
    assert.equal(slots[0]?.wardrobeId, 'kit-linen');
  });
});
