import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCharacterRecord,
  bundleFromCharacter,
  characterFromBundle,
  characterFromRoleplaySession,
  characterFromShared,
  mergeMigratedCharacters,
  slugCharacterName,
} from './character-os';
import type { CharacterIdentityBundle } from './character-identity-bundle';
import type { RoleplayLibrarySession } from './roleplay-library';
import type { SharedToolSettings } from './settings-cache';

const bundle: CharacterIdentityBundle = {
  version: 1,
  exportedAt: '2026-08-16T12:00:00.000Z',
  name: 'Rin',
  hints: 'black bob, red jacket',
  descriptor: 'Japanese woman, 28, sharp eyes',
  ipAdapterImageFilename: 'rin-lock.png',
  ipAdapterStrength: 0.72,
  lockedWardrobeId: 'jacket-01',
  loraTriggerPhrases: ['rinstyle'],
};

describe('character-os', () => {
  it('round-trips an identity bundle', () => {
    const character = characterFromBundle(bundle, 'char-rin');
    assert.equal(character.id, 'char-rin');
    assert.equal(character.name, 'Rin');
    assert.equal(character.ipAdapter?.imageFilename, 'rin-lock.png');
    const back = bundleFromCharacter(character);
    assert.equal(back.name, 'Rin');
    assert.equal(back.ipAdapterImageFilename, 'rin-lock.png');
    assert.equal(back.loraTriggerPhrases?.[0], 'rinstyle');
  });

  it('applies a character onto shared session fields including activeCharacterId', () => {
    const patch = applyCharacterRecord(characterFromBundle(bundle, 'char-rin'));
    assert.equal(patch.activeCharacterId, 'char-rin');
    assert.equal(patch.activeCharacterDescriptor, 'Japanese woman, 28, sharp eyes');
    assert.equal(patch.ipAdapterImageFilename, 'rin-lock.png');
    assert.equal(patch.lockedWardrobeId, 'jacket-01');
  });

  it('captures the live session lock into a character record', () => {
    const shared = {
      model: 'qwen-image-2512',
      detail: 'balanced',
      activeCharacterDescriptor: 'tall, silver hair',
      ipAdapterImageFilename: 'face.png',
      ipAdapterImageUrl: '/api/gallery/media/identity',
      ipAdapterStrength: 0.6,
      identityKind: 'ipadapter',
      lockedLocation: 'neon alley',
    } as SharedToolSettings;
    const record = characterFromShared(shared, { name: 'Nova', hints: 'rain-soaked streets' });
    assert.equal(record.name, 'Nova');
    assert.equal(record.ipAdapter?.imageUrl, '/api/gallery/media/identity');
    assert.equal(record.lockedLocation, 'neon alley');
  });

  it('migrates bundles and roleplay sessions without duplicating names', () => {
    const session = {
      id: 'rp-1',
      createdAt: 1,
      updatedAt: 2,
      title: 'Rin',
      beatCount: 1,
      snapshot: {
        characterName: 'Rin',
        bio: { name: 'Rin', look: 'black bob', personality: 'dry wit' },
        referenceImageFilename: 'rin-ref.png',
      },
    } as RoleplayLibrarySession;
    const merged = mergeMigratedCharacters({
      existing: [],
      bundles: [bundle],
      roleplaySessions: [session],
    });
    assert.equal(merged.length, 1);
    assert.equal(slugCharacterName(merged[0]!.name), 'rin');
  });

  it('converts a roleplay library session into a character with reference plate', () => {
    const converted = characterFromRoleplaySession({
      id: 'sess-9',
      createdAt: 1,
      updatedAt: 3,
      title: 'Kai',
      beatCount: 2,
      snapshot: {
        characterName: 'Kai',
        isolateSubject: true,
        referenceIsolated: true,
        referenceImageUrl: 'blob:cutout',
        referenceImageFilename: 'kai.png',
        playAs: 'photo',
      },
    } as RoleplayLibrarySession);
    assert.equal(converted?.name, 'Kai');
    assert.equal(converted?.reference?.isolatedFilename, 'kai.png');
    assert.equal(converted?.playAs, 'photo');
  });
});
