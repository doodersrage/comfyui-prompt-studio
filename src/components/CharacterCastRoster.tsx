'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  applyCharacterRecord,
  characterHomeHref,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  loraTriggerFromCharacter,
  migrateCharactersFromLegacy,
  subscribeCharacters,
} from '@/lib/character-os';
import {
  listSavedIdentityBundles,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { loadRoleplayLibrary } from '@/lib/roleplay-library';

export default function CharacterCastRoster() {
  const router = useRouter();
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );

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

  const applyAndOpen = (id: string) => {
    const character = characters.find(entry => entry.id === id);
    if (!character) {
      return;
    }
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(character),
    });
    router.push(characterHomeHref(id));
  };

  return (
    <ToolLayout
      accent="sky"
      width="wide"
      badge={<ToolBadge accent="sky">Cast</ToolBadge>}
      title="Characters"
      description="The character is the project. Open a home for looks, stills, clips, and LoRA."
    >
      {characters.length === 0 ? (
        <EmptyState
          icon="catalog"
          title="No characters yet"
          description="Save a look from Generate, Character, or Roleplay. Identity bundles and Roleplay casts migrate in automatically."
          action={{ label: 'Open Character tool', href: '/character' }}
        />
      ) : (
        <ToolSection title="Roster" description={`${characters.length} saved`}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {characters.map(character => {
              const looks = looksOf(character);
              const trigger = loraTriggerFromCharacter(character);
              return (
                <li key={character.id} className="ui-card space-y-3 p-[var(--card-padding)]">
                  <div className="space-y-1">
                    <p className="type-heading">{character.name}</p>
                    <p className="type-caption text-[var(--text-muted)]">
                      {looks.length} look{looks.length === 1 ? '' : 's'}
                      {trigger ? ` · ${trigger}` : ''}
                      {character.loraLibraryIds?.length
                        ? ` · ${character.loraLibraryIds.length} LoRA`
                        : ''}
                    </p>
                    {character.descriptor ? (
                      <p className="type-caption line-clamp-2">{character.descriptor}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={() => applyAndOpen(character.id)}>
                      Open home
                    </Button>
                    <ButtonLink href="/character" size="sm" variant="secondary">
                      Generate
                    </ButtonLink>
                    <Link
                      href={characterHomeHref(character.id)}
                      className="type-caption self-center text-[var(--accent-text)] underline-offset-2 hover:underline"
                    >
                      Details
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </ToolSection>
      )}
    </ToolLayout>
  );
}
