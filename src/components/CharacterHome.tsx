'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/ViewState';
import {
  SegmentedControl,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/browser-storage';
import {
  activateLook,
  addLookFromShared,
  applyCharacterRecord,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  loraTriggerFromCharacter,
  forgetCharacterRecord,
  pinLoraOnCharacter,
  removeLook,
  setCharacterTrigger,
  subscribeCharacters,
} from '@/lib/character-os';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  filterComfyGalleryEntries,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  getGalleryCache,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { buildGalleryHandoff, galleryHandoffPath, saveGalleryHandoff } from '@/lib/gallery-handoff';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { downloadLoraDatasetZip, selectCharacterKeepers } from '@/lib/gallery-lora-dataset-export';
import { deleteRoleplayLibrarySession } from '@/lib/roleplay-library';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';

type MediaTab = 'all' | 'stills' | 'clips' | 'keepers';

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
  const [triggerDraft, setTriggerDraft] = useState<string | null>(null);
  const [pinLoraId, setPinLoraId] = useState('');
  const [mediaTab, setMediaTab] = useState<MediaTab>('all');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [library] = useState(() =>
    typeof window === 'undefined' ? [] : (loadComfyUiSettings().loraLibrary ?? [])
  );

  const character = characters.find(entry => entry.id === characterId) ?? getCharacter(characterId);
  const trigger = triggerDraft ?? loraTriggerFromCharacter(character) ?? '';

  const looks = character ? looksOf(character) : [];
  const entries = useMemo(
    () => filterComfyGalleryEntries(gallery, { characterId }),
    [gallery, characterId]
  );
  const keepers = useMemo(
    () => selectCharacterKeepers(gallery, characterId),
    [gallery, characterId]
  );
  const lastClip = useMemo(
    () =>
      [...entries]
        .reverse()
        .find(
          entry =>
            entry.status === 'completed' &&
            isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) })
        ),
    [entries]
  );
  const visible = useMemo(() => {
    if (mediaTab === 'keepers') {
      return keepers;
    }
    return entries.filter(entry => {
      const kind = galleryEntryPrimaryMediaKind(entry);
      if (mediaTab === 'stills') {
        return !isGalleryClipEntry({ ...entry, mediaKind: kind });
      }
      if (mediaTab === 'clips') {
        return isGalleryClipEntry({ ...entry, mediaKind: kind });
      }
      return true;
    });
  }, [entries, keepers, mediaTab]);

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
        'Looks, stills, clips, and the LoRA flywheel for this character.'
      }
    >
      <ToolActionRow>
        <Button size="sm" variant="primary" onClick={() => go('/character')}>
          Generate
        </Button>
        <Button size="sm" variant="secondary" onClick={() => go('/roleplay')}>
          Roleplay
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

      <ToolSection
        title="LoRA flywheel"
        description="Keepers of this character become the dataset. Pin the trained weight so the next run uses it."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel>Trigger</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <input
                value={trigger}
                onChange={event => setTriggerDraft(event.target.value)}
                placeholder="rinstyle"
                className="ui-input min-w-[8rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                aria-label="LoRA trigger"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  persistApply(setCharacterTrigger(character.id, trigger));
                }}
              >
                Save trigger
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel>Pin library LoRA</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <select
                className="ui-input min-w-[10rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                value={pinLoraId}
                onChange={event => setPinLoraId(event.target.value)}
                aria-label="LoRA to pin"
              >
                <option value="">Select from library</option>
                {library.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label || entry.tokenValue || entry.id}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                disabled={!pinLoraId}
                onClick={() => {
                  const next = pinLoraOnCharacter(character.id, pinLoraId);
                  persistApply(next);
                  setPinLoraId('');
                }}
              >
                Pin
              </Button>
            </div>
          </div>
        </div>
        <p className="type-caption text-[var(--text-muted)]">
          {keepers.length} keeper{keepers.length === 1 ? '' : 's'} ready
          {character.loraLibraryIds?.length
            ? ` · ${character.loraLibraryIds.length} pinned LoRA`
            : ''}
        </p>
        <ToolActionRow>
          <Button
            size="sm"
            variant="secondary"
            disabled={keepers.length === 0}
            onClick={() => {
              setExportStatus('Exporting…');
              void downloadLoraDatasetZip(keepers, {
                triggerWord: trigger.trim() || loraTriggerFromCharacter(character),
              })
                .then(result => {
                  setExportStatus(`Exported ${result.count} images.`);
                })
                .catch(error => {
                  setExportStatus(
                    error instanceof Error ? error.message : 'Could not export dataset.'
                  );
                });
            }}
          >
            Export keepers as dataset
          </Button>
          <ButtonLink href="/settings?tab=comfyui&section=lora-train" size="sm" variant="ghost">
            Train / register
          </ButtonLink>
        </ToolActionRow>
        {exportStatus ? <p className="type-caption">{exportStatus}</p> : null}
      </ToolSection>

      <ToolSection
        title="Media"
        description={
          mediaTab === 'clips'
            ? 'Playable reel. Continue extends the last clip.'
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
              label: `Stills (${entries.filter(entry => !isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) })).length})`,
            },
            {
              value: 'clips',
              label: `Clips (${entries.filter(entry => isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) })).length})`,
            },
            { value: 'keepers', label: `Keepers (${keepers.length})` },
          ]}
        />
        {mediaTab === 'clips' && lastClip ? (
          <ToolActionRow>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                persistApply();
                saveGalleryHandoff(buildGalleryHandoff(lastClip, 'video'));
                router.push(galleryHandoffPath('video'));
              }}
            >
              Continue reel
            </Button>
            <Button size="sm" variant="secondary" onClick={() => go('/roleplay')}>
              Continue in Roleplay
            </Button>
          </ToolActionRow>
        ) : null}
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
              <CharacterMediaTile key={entry.id} entry={entry} characterId={character.id} />
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
}: {
  entry: ComfyGalleryEntry;
  characterId: string;
}) {
  const thumb = galleryEntryPrimaryThumbUrl(entry);
  const viewUrl = galleryEntryPrimaryViewUrl(entry);
  const clip = isGalleryClipEntry({
    ...entry,
    mediaKind: galleryEntryPrimaryMediaKind(entry),
  });
  const href = `/gallery?character=${encodeURIComponent(characterId)}&focus=${encodeURIComponent(entry.id)}`;
  return (
    <li>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]">
        {clip && viewUrl ? (
          <video
            src={viewUrl}
            poster={thumb ?? undefined}
            className="aspect-square w-full object-cover"
            controls
            playsInline
            muted
          />
        ) : (
          <Link href={href} className="block">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center type-caption text-[var(--text-muted)]">
                {entry.status}
              </div>
            )}
          </Link>
        )}
        <p className="type-caption truncate px-2 py-1 text-[var(--text-muted)]">
          {clip ? 'Clip' : 'Still'}
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
        </p>
      </div>
    </li>
  );
}
