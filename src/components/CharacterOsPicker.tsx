'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  applyCharacterRecord,
  characterFromShared,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  loraTriggerFromCharacter,
  migrateCharactersFromLegacy,
  removeCharacter,
  subscribeCharacters,
  upsertCharacter,
} from '@/lib/character-os';
import { listSavedIdentityBundles, type SharedToolSettings } from '@/lib/settings-cache';
import { loadRoleplayLibrary } from '@/lib/roleplay-library';

type CharacterOsPickerProps = {
  shared: SharedToolSettings;
  hints?: string;
  onApply: (patch: Partial<SharedToolSettings>) => void;
};

export default function CharacterOsPicker({ shared, hints, onApply }: CharacterOsPickerProps) {
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const [name, setName] = useState('');

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      migrateCharactersFromLegacy({
        bundles: listSavedIdentityBundles(),
        roleplaySessions: loadRoleplayLibrary(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeId = shared.activeCharacterId?.trim();
  const active = getCharacter(activeId) ?? characters.find(entry => entry.id === activeId);

  const applyId = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      onApply({ activeCharacterId: undefined });
      return;
    }
    onApply(applyCharacterRecord(character));
  };

  const saveCurrent = () => {
    const resolvedName = name.trim() || active?.name || 'Untitled character';
    const record = characterFromShared(shared, {
      name: resolvedName,
      hints,
      notes: active?.notes,
    });
    if (activeId) {
      record.id = activeId;
    }
    upsertCharacter(record);
    onApply({ activeCharacterId: record.id });
    setName('');
  };

  return (
    <div className="space-y-2">
      <FieldLabel>Character</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <select
          className="ui-input min-w-[12rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          value={activeId ?? ''}
          onChange={event => applyId(event.target.value)}
          aria-label="Active character"
        >
          <option value="">None — session only</option>
          {characters.map(character => (
            <option key={character.id} value={character.id}>
              {character.name}
              {loraTriggerFromCharacter(character)
                ? ` · ${loraTriggerFromCharacter(character)}`
                : ''}
            </option>
          ))}
        </select>
        {activeId ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              removeCharacter(activeId);
              onApply({ activeCharacterId: undefined });
            }}
          >
            Forget
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder={active?.name || 'Name this look'}
          className="ui-input min-w-[10rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          aria-label="Character name"
        />
        <Button size="sm" variant="secondary" onClick={saveCurrent}>
          Save character
        </Button>
      </div>
      <p className="type-caption text-[var(--text-muted)]">
        One record for face lock, wardrobe, descriptor, and LoRA trigger. Generate, Roleplay, Video,
        and LoRA export all read the active character.
      </p>
    </div>
  );
}
