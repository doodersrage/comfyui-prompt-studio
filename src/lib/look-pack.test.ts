import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLookPackToDaySlots,
  applyLookPackToFittingState,
  applyLookPackToRoleplaySettings,
  buildLookPackFromMoodboard,
  buildPortableLookPack,
  inferRoleplayToneFromLookPack,
  lookPackDayHref,
  lookPackFittingHref,
  lookPackPlayCampaignHref,
  lookPackRoleplayHref,
  lookPackNotes,
  normalizeLookPack,
  normalizePortableLookPack,
  PORTABLE_LOOK_PACK_KIND,
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

  it('lookPackRoleplayHref and roleplay settings mapping', () => {
    const pack = buildLookPackFromMoodboard({
      characterId: 'char-1',
      wardrobeId: 'kit-a',
      tiles: [
        { id: 't1', role: 'location', notes: 'rainy street' },
        { id: 't2', role: 'mood', notes: 'noir mystery' },
      ],
    });
    assert.match(lookPackRoleplayHref(pack), /from=look/);
    assert.match(lookPackRoleplayHref(pack), /character=char-1/);
    const applied = applyLookPackToRoleplaySettings(pack);
    assert.equal(applied.tool.setting, 'rainy street');
    assert.equal(applied.shared.lockedWardrobeId, 'kit-a');
    assert.equal(inferRoleplayToneFromLookPack(pack), 'noir');
  });

  it('normalizeLookPack accepts saved source', () => {
    const pack = buildLookPackFromMoodboard({ tiles: [{ id: 't1', role: 'mood', notes: 'calm' }] });
    const saved = normalizeLookPack({ ...pack, source: 'saved' });
    assert.equal(saved?.source, 'saved');
  });

  it('from=look handoff contracts seed Fitting, Day, and Roleplay the same way', () => {
    const pack = buildLookPackFromMoodboard({
      characterId: 'char-1',
      wardrobeId: 'kit-linen',
      instruction: 'golden hour soft light',
      tiles: [
        { id: 't1', role: 'location', notes: 'sunlit kitchen' },
        { id: 't2', role: 'mood', notes: 'cozy morning' },
        { id: 't3', role: 'lighting', notes: 'rim light' },
      ],
    });

    assert.match(lookPackFittingHref(pack), /from=look/);
    assert.match(lookPackFittingHref(pack), /character=char-1/);
    assert.match(lookPackFittingHref(pack), /wardrobe=kit-linen/);
    assert.match(lookPackDayHref(pack), /from=look/);
    assert.match(lookPackDayHref(pack), /character=char-1/);
    assert.match(lookPackRoleplayHref(pack), /from=look/);

    const fitting = applyLookPackToFittingState(pack);
    assert.equal(fitting.shared.lockedWardrobeId, 'kit-linen');
    assert.match(fitting.tool.notes ?? '', /golden hour|cozy morning|rim light/);

    const slots = applyLookPackToDaySlots(DEFAULT_DAY_SLOTS, pack);
    assert.equal(slots[0]?.location, 'sunlit kitchen');
    assert.equal(slots[0]?.wardrobeId, 'kit-linen');
    assert.match(slots[0]?.sceneHints ?? '', /cozy morning/);

    const roleplay = applyLookPackToRoleplaySettings(pack);
    assert.equal(roleplay.tool.setting, 'sunlit kitchen');
    assert.equal(roleplay.shared.lockedWardrobeId, 'kit-linen');
    assert.equal(inferRoleplayToneFromLookPack(pack), 'cozy');
  });

  it('portable look pack round-trips for share/import', () => {
    const pack = buildLookPackFromMoodboard({
      characterId: 'char-1',
      wardrobeId: 'kit-a',
      tiles: [{ id: 't1', role: 'mood', notes: 'noir alley' }],
    });
    const portable = buildPortableLookPack({ pack, name: 'Night look', id: 'lp-1' });
    assert.equal(portable.kind, PORTABLE_LOOK_PACK_KIND);
    assert.equal(portable.version, 1);
    assert.equal(portable.name, 'Night look');
    const restored = normalizePortableLookPack(JSON.parse(JSON.stringify(portable)));
    assert.equal(restored?.pack.characterId, 'char-1');
    assert.equal(restored?.pack.wardrobeId, 'kit-a');
    assert.match(restored?.pack.moodNotes ?? '', /noir/);
    assert.equal(normalizePortableLookPack({ version: 1, kind: 'other' }), null);
    const bare = normalizePortableLookPack(pack);
    assert.equal(bare?.pack.version, 1);
    assert.match(lookPackPlayCampaignHref('char-1', 'lp-1'), /lookPack=lp-1/);
  });
});
