import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  newMoodboardTileId,
  normalizeMoodboardTemplateId,
  normalizeMoodboardTiles,
  synthesizeMoodboardPrompt,
} from './moodboard-scene';

describe('moodboard-scene', () => {
  it('normalizeMoodboardTemplateId falls back to scene-blend', () => {
    assert.equal(normalizeMoodboardTemplateId('bogus'), 'scene-blend');
    assert.equal(normalizeMoodboardTemplateId('location'), 'location');
  });

  it('normalizeMoodboardTiles caps at four tiles', () => {
    const tiles = normalizeMoodboardTiles(
      Array.from({ length: 6 }, (_, index) => ({
        id: `t${index}`,
        role: 'mood' as const,
      }))
    );
    assert.equal(tiles.length, 4);
  });

  it('synthesizeMoodboardPrompt merges tiles and instruction', () => {
    const prompt = synthesizeMoodboardPrompt({
      templateId: 'lighting-mood',
      characterName: 'Kai',
      instruction: 'wide cinematic frame',
      tiles: [
        {
          id: newMoodboardTileId(),
          role: 'lighting',
          notes: 'golden hour rim light',
        },
      ],
    });
    assert.match(prompt, /lighting/i);
    assert.match(prompt, /Kai/);
    assert.match(prompt, /golden hour rim light/);
    assert.match(prompt, /wide cinematic frame/);
  });

  it('synthesizeMoodboardPrompt requires tiles or instruction', () => {
    assert.throws(
      () => synthesizeMoodboardPrompt({ tiles: [] }),
      /Add at least one moodboard tile/
    );
  });
});
