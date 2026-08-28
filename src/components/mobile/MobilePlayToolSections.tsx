'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import RoleplayLibraryPanel from '@/components/RoleplayLibraryPanel';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { useRoleplayFilmActions } from '@/hooks/useRoleplayFilmActions';
import { FieldError, TextInput } from '@/components/ui/Field';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRoleplayStorySync } from '@/hooks/useRoleplayStorySync';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { IDENTITY_MEDIA_URL, persistIdentityImage } from '@/lib/gallery-media-client';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import {
  normalizeCharacterPlates,
  roleplayPatchFromPlate,
  type CharacterPlate,
} from '@/lib/mobile-studio';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import {
  appendRoleplayStoryBeat,
  applyRoleplayCharacterName,
  beginRoleplayStillRetryPatch,
  canRetryRoleplayStill,
  formatRoleplayBio,
  formatRoleplayStoryProgress,
  lastRoleplayPlotBeat,
  MAX_ROLEPLAY_CHARACTER_NAME,
  mergeRoleplayRejectedScenes,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
  roleplayStoryPhase,
  selectRoleplayStillTakePatch,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import {
  applyRoleplayLibrarySession,
  archiveAndStartNewRoleplaySession,
  persistRoleplayLibraryFromCache,
  type RoleplayLibrarySession,
} from '@/lib/roleplay-library';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
  SETTINGS_CACHE_UPDATED_EVENT,
} from '@/lib/settings-cache';
import {
  buildRoleplayQueueStillOptions,
  buildRoleplayRequestBody,
  type RoleplayApiPayload,
} from '@/lib/roleplay-play-core';
import { dispatchWebhook } from '@/lib/webhook-settings';

const TOOL_ID = 'roleplay';
const EMPTY_STORY: RoleplayStoryBeat[] = [];

function loadPlates(): CharacterPlate[] {
  return normalizeCharacterPlates(
    loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE).plates
  );
}

function loadActivePlate(): CharacterPlate | null {
  const cache = loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE);
  const plates = normalizeCharacterPlates(cache.plates);
  return plates.find(plate => plate.id === cache.activePlateId) ?? plates[0] ?? null;
}

import type { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';

type ViewModel = ReturnType<typeof useMobilePlayToolOrchestration>;
type Props = ViewModel & { description: string };

export default function MobilePlayToolSections({ description, ...vm }: Props) {
  const {
    mounted,
    shared,
    toolSettings,
    updateToolSettings,
    plates,
    activePlate,
    scenes,
    setScenes,
    error,
    setError,
    bioLoading,
    playingId,
    isolating,
    ownBibleOpen,
    setOwnBibleOpen,
    personaId,
    tone,
    content,
    playAs,
    isolateSubject,
    bio,
    story,
    storyProgress,
    autoQueue,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    cutRoleplayFilm,
    saveFilmToCast,
    filmError,
    hasReferenceImage,
    referenceImageUrl,
    writeBio,
    applyOwnBible,
    playScene,
    queueBeat,
    selectStillTake,
    continueLibrarySession,
    startLibrarySession,
    plateUrl,
    autoIsolateAttemptedRef,
    setPlates,
    setActivePlate,
  } = vm;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Play</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          From photo — identity lock from your plate. Write a bio, then tap a beat.
        </p>
      </div>

      {plateUrl ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2">
          <div className="h-16 w-16 overflow-hidden rounded-xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plateUrl} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {activePlate?.name || bio?.name || 'Plate'}
            </p>
            <p className="type-caption text-[var(--text-muted)]">
              {playAs === 'photo' ? 'From photo' : 'Switching to From photo'}
              {toolSettings.referenceIsolated === true
                ? ' · isolated'
                : isolating
                  ? ' · isolating…'
                  : isolateSubject
                    ? ' · isolate on'
                    : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No plate yet.</p>
          <Link href="/m" className="ui-btn-primary mt-3 inline-flex justify-center">
            Capture one
          </Link>
        </div>
      )}

      {plates.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {plates.map(plate => (
            <button
              key={plate.id}
              type="button"
              onClick={() => {
                autoIsolateAttemptedRef.current = false;
                updateToolSettings(roleplayPatchFromPlate(plate));
                setActivePlate(plate);
                const mobile = loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE);
                saveToolSettings('mobileStudio', {
                  ...mobile,
                  activePlateId: plate.id,
                });
              }}
              className={[
                'h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white',
                plate.id === activePlate?.id
                  ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                  : 'border-[var(--border-subtle)]',
              ].join(' ')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plate.isolated ? plate.isolatedUrl : plate.originalUrl}
                alt={plate.name}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <label className="block space-y-1.5 text-sm">
        <span className="type-caption text-[var(--text-muted)]">Character name</span>
        <TextInput
          name="roleplay-character-lock"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={toolSettings.characterName ?? ''}
          disabled={bioLoading}
          maxLength={MAX_ROLEPLAY_CHARACTER_NAME}
          placeholder="Optional — leave blank to invent one"
          onChange={event => {
            const characterName = event.target.value;
            updateToolSettings({
              characterName,
              bio: bio ? applyRoleplayCharacterName(bio, characterName) : bio,
            });
          }}
        />
      </label>

      <PrimaryButton
        disabled={!hasReferenceImage || bioLoading || isolating}
        loading={bioLoading}
        onClick={() => void writeBio()}
        className="w-full justify-center"
      >
        {bio ? 'Rewrite bio + first look' : 'Write my bio'}
      </PrimaryButton>
      <Button
        variant="secondary"
        disabled={bioLoading || isolating}
        onClick={() => setOwnBibleOpen(open => !open)}
        className="w-full justify-center"
      >
        {bio ? 'Edit bible' : 'Use my own bible'}
      </Button>

      {ownBibleOpen ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3">
          <RoleplayBibleEditor
            key={bio ? `${bio.name}-${bio.look}` : 'new-bible'}
            initial={bio}
            characterName={toolSettings.characterName}
            disabled={bioLoading || isolating}
            applyLabel={bio ? 'Update bible' : 'Use this bible'}
            onApply={nextBio => void applyOwnBible(nextBio)}
          />
        </div>
      ) : null}

      {bio && !ownBibleOpen ? (
        <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          {formatRoleplayBio(bio)}
        </pre>
      ) : null}

      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">Library</p>
        <RoleplayLibraryPanel
          activeSessionId={toolSettings.activeSessionId}
          busy={bioLoading || playingId !== null}
          onContinue={continueLibrarySession}
          onNew={startLibrarySession}
          onDeleted={id => {
            if (id === toolSettings.activeSessionId) {
              updateToolSettings({ activeSessionId: undefined });
            }
          }}
        />
      </div>

      {scenes.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">{storyProgress.heading}</p>
          <p className="text-xs text-[var(--text-muted)]">{storyProgress.hint}</p>
          <div className="grid gap-2">
            {scenes.map(scene => (
              <button
                key={scene.id}
                type="button"
                disabled={playingId !== null}
                onClick={() => void playScene(scene)}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-3 text-left transition hover:border-[var(--accent-border)] disabled:opacity-50"
              >
                <p className="text-sm font-medium">{scene.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{scene.blurb}</p>
                {playingId === scene.id ? (
                  <p className="mt-1 type-caption text-[var(--accent-text)]">Writing still…</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {storyProgress.phase === 'complete' ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">{storyProgress.hint}</p>
          <Button
            variant="secondary"
            disabled={bioLoading || playingId !== null}
            onClick={() => {
              updateToolSettings({ story: [], rejectedScenes: [] });
              setScenes([]);
            }}
            className="w-full justify-center"
          >
            Restart story
          </Button>
        </div>
      ) : null}

      <RoleplayStoryReel
        story={story}
        busy={bioLoading || playingId !== null || assemblingFilm}
        onQueue={beat => void queueBeat(beat)}
        onRetry={beat => void queueBeat(beat, { retry: true })}
        onSelectTake={selectStillTake}
      />

      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">
          Phone companion path: Capture → Queue → Rate → continue the film loop on desk.
        </p>
        <Link
          href="/day"
          className="ui-btn-secondary w-full justify-center text-center text-sm"
          data-testid="mobile-continue-desk-day"
        >
          Continue Day on desk
        </Link>
        <Link
          href="/play"
          className="ui-btn-secondary w-full justify-center text-center text-sm"
          data-testid="mobile-continue-desk-play"
        >
          Play campaign on desk
        </Link>
        <Button
          variant="ghost"
          loading={assemblingFilm}
          loadingLabel="Cutting film"
          disabled={story.length === 0 || assemblingFilm || bioLoading}
          onClick={() => void cutRoleplayFilm()}
          className="w-full justify-center"
        >
          Cut film
        </Button>
        <p className="type-caption text-center text-[var(--text-muted)]">
          Optional on phone · full Fitting / Day / Cut loop on desk
        </p>
        {filmNeedsCast ? (
          <Button
            variant="ghost"
            disabled={bioLoading || assemblingFilm}
            onClick={saveFilmToCast}
            className="w-full justify-center"
            data-testid="roleplay-save-film-cast"
          >
            Save to Cast
          </Button>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <Link
            href={`/characters/${encodeURIComponent(filmCharacterId)}?media=films`}
            className="ui-btn-ghost w-full justify-center text-center text-sm"
            data-testid="roleplay-open-cast-film"
            onClick={() => {
              void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                markOnboardingWatchFirstFilm();
              });
            }}
          >
            Open on Cast
          </Link>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <Link
            href={`/gallery?character=${encodeURIComponent(filmCharacterId)}&derivedKind=film`}
            className="ui-btn-ghost w-full justify-center text-center text-sm"
            data-testid="roleplay-open-gallery"
          >
            Open in Gallery
          </Link>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm ? (
          <Link
            href={`/play?character=${encodeURIComponent(filmCharacterId)}`}
            className="ui-btn-secondary w-full justify-center text-center text-sm"
            data-testid="roleplay-campaign-complete"
          >
            Campaign complete — Open Play
          </Link>
        ) : null}
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      </div>

      <FieldError>{error || filmError}</FieldError>
      <Link href="/roleplay" className="ui-btn-ghost w-full justify-center text-center text-sm">
        Full Roleplay on desk
      </Link>
    </div>
  );
}
