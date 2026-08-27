'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CharacterFilmStudio from '@/components/CharacterFilmStudio';
import CharacterLoraFlywheel from '@/components/CharacterLoraFlywheel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import {
  SegmentedControl,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/browser-storage';
import { isAssembledFilmEntry } from '@/lib/character-film';
import {
  activateLook,
  activeLook,
  addLookFromShared,
  addCharacterLookPack,
  applyCharacterRecord,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  lookPacksOf,
  looksOf,
  forgetCharacterRecord,
  removeLook,
  removeCharacterLookPack,
  subscribeCharacters,
  toggleLookKeeper,
} from '@/lib/character-os';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  clearGalleryCharacterStamp,
  filterComfyGalleryEntries,
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryViewUrl,
  getGalleryCache,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { unstampForeignCharacterGalleryEntries } from '@/lib/gallery-character-stamp';
import { buildGalleryHandoff, galleryHandoffPath, saveGalleryHandoff } from '@/lib/gallery-handoff';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { selectCharacterKeepers } from '@/lib/gallery-lora-dataset-export';
import {
  deleteRoleplayLibrarySession,
  resolveRoleplayContinueFromCharacter,
} from '@/lib/roleplay-library';
import { loadSettingsCache, saveSharedSettings, saveToolSettings } from '@/lib/settings-cache';
import {
  downloadLookPackFile,
  lookPackDayHref,
  lookPackFittingHref,
  parseLookPackFile,
  saveLookPack,
} from '@/lib/look-pack';
import { playCampaignHref } from '@/lib/play-campaign';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import { FieldError } from '@/components/ui/Field';

type MediaTab = 'all' | 'stills' | 'clips' | 'films' | 'keepers';

type CharacterHomeProps = {
  characterId: string;
};

const EMPTY_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  };
}

export default function CharacterHome({ characterId }: CharacterHomeProps) {
  const router = useRouter();
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  const [lookName, setLookName] = useState('');
  const [mediaTab, setMediaTab] = useState<MediaTab>('all');
  const [continueError, setContinueError] = useState<string | null>(null);
  const [lookPackStatus, setLookPackStatus] = useState<string | null>(null);
  const lookPackFileRef = useRef<HTMLInputElement | null>(null);

  const character = characters.find(entry => entry.id === characterId) ?? getCharacter(characterId);

  useEffect(() => {
    unstampForeignCharacterGalleryEntries();
  }, []);

  const looks = character ? looksOf(character) : [];
  const savedLookPacks = character ? lookPacksOf(character) : [];
  const currentLook = character ? activeLook(character) : undefined;
  const entries = useMemo(
    () => filterComfyGalleryEntries(gallery, { characterId }),
    [gallery, characterId]
  );
  const lookKeeperIds = currentLook?.keeperEntryIds;
  const keepers = selectCharacterKeepers(
    gallery,
    characterId,
    lookKeeperIds !== undefined ? { keeperIds: lookKeeperIds } : undefined
  );
  const fallbackKeeperIds = selectCharacterKeepers(gallery, characterId).map(entry => entry.id);
  const lastClip = useMemo(
    () =>
      [...entries]
        .reverse()
        .find(
          entry =>
            entry.status === 'completed' &&
            isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) }) &&
            !isAssembledFilmEntry(entry)
        ),
    [entries]
  );
  const filmEntries = useMemo(
    () => entries.filter(entry => isAssembledFilmEntry(entry)),
    [entries]
  );
  const clipEntries = useMemo(
    () =>
      entries.filter(entry => {
        const kind = galleryEntryPrimaryMediaKind(entry);
        return isGalleryClipEntry({ ...entry, mediaKind: kind }) && !isAssembledFilmEntry(entry);
      }),
    [entries]
  );
  const stillEntries = useMemo(
    () =>
      entries.filter(entry => {
        const kind = galleryEntryPrimaryMediaKind(entry);
        return !isGalleryClipEntry({ ...entry, mediaKind: kind });
      }),
    [entries]
  );
  const visible =
    mediaTab === 'keepers'
      ? keepers
      : mediaTab === 'films'
        ? filmEntries
        : mediaTab === 'stills'
          ? stillEntries
          : mediaTab === 'clips'
            ? clipEntries
            : entries;

  const persistApply = (next = character) => {
    if (!next) {
      return;
    }
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(next),
    });
  };

  const go = (href: string) => {
    persistApply();
    router.push(href);
  };

  if (!character) {
    return (
      <ToolLayout
        accent="sky"
        badge={<ToolBadge accent="sky">Cast</ToolBadge>}
        title="Character not found"
        description="That record is not in this browser’s Character OS store."
      >
        <ButtonLink href="/characters" size="sm" variant="secondary">
          Back to cast
        </ButtonLink>
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent="sky"
      width="wide"
      badge={<ToolBadge accent="sky">Cast</ToolBadge>}
      title={character.name}
      description={
        character.descriptor?.trim() ||
        'Looks, stills, clips, the film cut, and the LoRA flywheel for this character.'
      }
    >
      <ToolActionRow>
        <Button size="sm" variant="primary" onClick={() => go(playCampaignHref(character.id))}>
          Play campaign
        </Button>
        <Button size="sm" variant="primary" onClick={() => go('/character')}>
          Generate
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('/roleplay')}>
          Roleplay
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => go(`/fitting?character=${character.id}`)}
        >
          Try on
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go(`/day?character=${character.id}`)}>
          Plan a day
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => go(`/moodboard?character=${character.id}`)}
        >
          Set look
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('/video')}>
          Video
        </Button>
        <ButtonLink href={`/gallery?character=${encodeURIComponent(character.id)}`} size="sm">
          Open in Gallery
        </ButtonLink>
        <ButtonLink href="/characters" size="sm" variant="ghost">
          All characters
        </ButtonLink>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (
              !window.confirm(
                `Remove ${character.name} from the cast? Looks on this record go with it. Gallery stills stay in the gallery.`
              )
            ) {
              return;
            }
            const { roleplaySessionId } = forgetCharacterRecord(character.id);
            if (roleplaySessionId) {
              deleteRoleplayLibrarySession(roleplaySessionId);
            }
            router.push('/characters');
          }}
        >
          Remove from cast
        </Button>
      </ToolActionRow>

      {character ? (
        <ToolSection
          title="Saved look packs"
          description="Reuse Moodboard vibes without re-running vision extract. Export JSON to share a look."
        >
          <input
            ref={lookPackFileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file || !character) {
                return;
              }
              void parseLookPackFile(file).then(portable => {
                if (!portable) {
                  setLookPackStatus('That file is not a Prompt Studio look pack.');
                  return;
                }
                addCharacterLookPack(character.id, portable.name || 'Imported look', portable.pack);
                setLookPackStatus(`Imported "${portable.name || 'look pack'}".`);
              });
            }}
          />
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => lookPackFileRef.current?.click()}>
              Import look pack
            </Button>
            <ButtonLink href={playCampaignHref(character.id)} size="sm" variant="ghost">
              Play campaign
            </ButtonLink>
          </div>
          {lookPackStatus ? (
            <p className="type-caption mb-3 text-[var(--text-muted)]">{lookPackStatus}</p>
          ) : null}
          {savedLookPacks.length === 0 ? (
            <p className="type-caption text-[var(--text-muted)]">
              No saved packs yet — extract a look on Moodboard and Save on Cast, or import JSON.
            </p>
          ) : (
            <ul className="ui-list">
              {savedLookPacks.map(entry => (
                <li key={entry.id} className="ui-list-row items-center">
                  <div className="ui-list-primary min-w-0">
                    <p className="type-heading">{entry.name}</p>
                    <p className="type-caption text-[var(--text-muted)]">
                      {new Date(entry.savedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        saveLookPack(entry.pack);
                        go(lookPackFittingHref(entry.pack));
                      }}
                    >
                      Fitting
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        saveLookPack(entry.pack);
                        go(lookPackDayHref(entry.pack));
                      }}
                    >
                      Day
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        downloadLookPackFile({
                          pack: entry.pack,
                          name: entry.name,
                          id: entry.id,
                        })
                      }
                    >
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCharacterLookPack(character.id, entry.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ToolSection>
      ) : null}

      <ToolSection
        title="Looks"
        description="Switching a look keeps the others. Save the live session as a new era."
      >
        <ul className="ui-list">
          {looks.map(look => {
            const active = look.id === character.activeLookId;
            return (
              <li key={look.id} className="ui-list-row items-center">
                <div className="ui-list-primary min-w-0">
                  <p className="type-heading">
                    {look.name}
                    {active ? ' · active' : ''}
                  </p>
                  <p className="type-caption line-clamp-2 text-[var(--text-muted)]">
                    {look.descriptor || look.hints || look.lockedWardrobeId || 'Session lock'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {active ? null : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const next = activateLook(character.id, look.id);
                        persistApply(next);
                      }}
                    >
                      Use
                    </Button>
                  )}
                  {looks.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const next = removeLook(character.id, look.id);
                        persistApply(next);
                      }}
                    >
                      Drop
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            value={lookName}
            onChange={event => setLookName(event.target.value)}
            placeholder="New look name — bob, winter coat…"
            className="ui-input min-w-[12rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            aria-label="New look name"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const next = addLookFromShared(
                character.id,
                loadSettingsCache().shared,
                lookName.trim() || `Look ${looks.length + 1}`
              );
              persistApply(next);
              setLookName('');
            }}
          >
            Save current as look
          </Button>
        </div>
      </ToolSection>

      {currentLook ? (
        <CharacterLoraFlywheel
          character={character}
          look={currentLook}
          keepers={keepers}
          onApplied={persistApply}
        />
      ) : null}

      <CharacterFilmStudio
        characterId={character.id}
        characterName={character.name}
        lookId={character.activeLookId}
        filmCut={character.filmCut}
        entries={entries}
      />

      <ToolSection
        title="Media"
        description={
          mediaTab === 'clips'
            ? 'Playable reel. Continue extends a Fal clip or queues last-frame I2V.'
            : mediaTab === 'films'
              ? 'Assembled Day / Roleplay films stamped on this character.'
              : 'Jobs stamped with this character.'
        }
      >
        <SegmentedControl
          aria-label="Character media"
          value={mediaTab}
          onChange={setMediaTab}
          options={[
            { value: 'all', label: `All (${entries.length})` },
            {
              value: 'stills',
              label: `Stills (${stillEntries.length})`,
            },
            {
              value: 'clips',
              label: `Clips (${clipEntries.length})`,
            },
            {
              value: 'films',
              label: `Films (${filmEntries.length})`,
            },
            { value: 'keepers', label: `Keepers (${keepers.length})` },
          ]}
        />
        {mediaTab === 'clips' || mediaTab === 'films' || mediaTab === 'all' ? (
          <ToolActionRow>
            {mediaTab !== 'films' && lastClip ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  persistApply();
                  saveGalleryHandoff(buildGalleryHandoff(lastClip, 'video'));
                  router.push(galleryHandoffPath('video'));
                }}
              >
                {continueClipActionLabel({
                  parentUrl: galleryEntryPrimaryViewUrl(lastClip),
                  engine: loadEngineSettings().engine,
                }) === 'Extend clip'
                  ? 'Extend reel'
                  : 'Continue reel'}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              data-testid="cast-continue-roleplay"
              onClick={() => {
                persistApply();
                const result = resolveRoleplayContinueFromCharacter(character.id);
                if (!result.ok) {
                  setContinueError(result.message);
                  return;
                }
                setContinueError(null);
                saveToolSettings('roleplay', result.cache);
                go('/roleplay');
              }}
            >
              Continue in Roleplay
            </Button>
          </ToolActionRow>
        ) : null}
        {continueError ? <FieldError>{continueError}</FieldError> : null}
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="Nothing stamped yet"
            description="Queue from Generate, Roleplay, or Video with this character active. Older stills stay untagged."
            action={{ label: 'Generate as this character', onClick: () => go('/character') }}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {visible.map(entry => (
              <CharacterMediaTile
                key={entry.id}
                entry={entry}
                characterId={character.id}
                kept={keepers.some(keeper => keeper.id === entry.id)}
                onToggleKeeper={
                  currentLook
                    ? () => {
                        persistApply(
                          toggleLookKeeper(character.id, currentLook.id, entry.id, {
                            fallbackIds: fallbackKeeperIds,
                          })
                        );
                      }
                    : undefined
                }
                onAnimateStill={
                  !isGalleryClipEntry({
                    ...entry,
                    mediaKind: galleryEntryPrimaryMediaKind(entry),
                  }) && entry.status === 'completed'
                    ? () => {
                        persistApply();
                        saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
                        router.push(galleryHandoffPath('video'));
                      }
                    : undefined
                }
                onRemoveFromCharacter={() => {
                  if (currentLook && keepers.some(keeper => keeper.id === entry.id)) {
                    persistApply(
                      toggleLookKeeper(character.id, currentLook.id, entry.id, {
                        fallbackIds: fallbackKeeperIds,
                      })
                    );
                  }
                  clearGalleryCharacterStamp([entry.id]);
                }}
              />
            ))}
          </ul>
        )}
      </ToolSection>
    </ToolLayout>
  );
}

function CharacterMediaTile({
  entry,
  characterId,
  kept,
  onToggleKeeper,
  onAnimateStill,
  onRemoveFromCharacter,
}: {
  entry: ComfyGalleryEntry;
  characterId: string;
  kept?: boolean;
  onToggleKeeper?: () => void;
  onAnimateStill?: () => void;
  onRemoveFromCharacter?: () => void;
}) {
  const previewSrc = galleryEntryHeroPreviewUrl(entry);
  const clip = isGalleryClipEntry({
    ...entry,
    mediaKind: galleryEntryPrimaryMediaKind(entry),
  });
  const href = `/gallery?character=${encodeURIComponent(characterId)}&focus=${encodeURIComponent(entry.id)}`;
  return (
    <li>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]">
        {clip && previewSrc ? (
          <GalleryEntryPreview
            entry={entry}
            className="aspect-square w-full object-cover"
            controls
          />
        ) : (
          <Link href={href} className="block">
            {previewSrc ? (
              <GalleryEntryPreview entry={entry} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center type-caption text-[var(--text-muted)]">
                {entry.status}
              </div>
            )}
          </Link>
        )}
        <p className="type-caption truncate px-2 py-1 text-[var(--text-muted)]">
          {isAssembledFilmEntry(entry) ? 'Film' : clip ? 'Clip' : 'Still'}
          {kept ? ' · keeper' : ''}
          {entry.reviewRating ? ` · ${entry.reviewRating}★` : ''}
          {entry.favorite ? ' · fav' : ''}
          {clip ? (
            <>
              {' · '}
              <Link href={href} className="underline-offset-2 hover:underline">
                Open
              </Link>
            </>
          ) : null}
          {!clip && onAnimateStill ? (
            <>
              {' · '}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={onAnimateStill}
              >
                Animate
              </button>
            </>
          ) : null}
          {!clip && onToggleKeeper ? (
            <>
              {' · '}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={onToggleKeeper}
              >
                {kept ? 'Drop keeper' : 'Keep'}
              </button>
            </>
          ) : null}
          {onRemoveFromCharacter ? (
            <>
              {' · '}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={onRemoveFromCharacter}
              >
                Remove
              </button>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}
