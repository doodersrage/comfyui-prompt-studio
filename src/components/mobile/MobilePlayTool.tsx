'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import RoleplayLibraryPanel from '@/components/RoleplayLibraryPanel';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import { Button, PrimaryButton } from '@/components/ui/Button';
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
  lastRoleplayPlotBeat,
  MAX_ROLEPLAY_CHARACTER_NAME,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
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

export default function MobilePlayTool() {
  const { mounted, shared, toolSettings, updateToolSettings } = useCachedSettings(
    'roleplay',
    DEFAULT_ROLEPLAY_TOOL_CACHE
  );
  const [plates, setPlates] = useState<CharacterPlate[]>([]);
  const [activePlate, setActivePlate] = useState<CharacterPlate | null>(null);
  const [scenes, setScenes] = useState<RoleplayScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isolating, setIsolating] = useState(false);
  const [ownBibleOpen, setOwnBibleOpen] = useState(false);
  const autoIsolateAttemptedRef = useRef(false);

  const personaId = toolSettings.personaId ?? 'raccoon-pirate';
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content);
  const playAs = normalizeRoleplayPlayAs(toolSettings.playAs);
  const isolateSubject = normalizeRoleplayIsolateSubject(toolSettings.isolateSubject);
  const bio = toolSettings.bio;
  const story = toolSettings.story ?? EMPTY_STORY;
  const autoQueue = toolSettings.autoQueue !== false;
  const storyRef = useRef(story);
  useEffect(() => {
    storyRef.current = story;
  }, [story]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      const persisted = persistRoleplayLibraryFromCache(toolSettings);
      if (
        persisted &&
        persisted.cache.activeSessionId &&
        persisted.cache.activeSessionId !== toolSettings.activeSessionId
      ) {
        updateToolSettings({ activeSessionId: persisted.cache.activeSessionId });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mounted, toolSettings, updateToolSettings]);

  const referenceImageUrl = toolSettings.referenceImageUrl?.trim() || '';
  const referenceImageFilename = toolSettings.referenceImageFilename?.trim() || '';
  const referenceOriginalUrl = toolSettings.referenceOriginalUrl?.trim() || '';
  const referenceOriginalFilename = toolSettings.referenceOriginalFilename?.trim() || '';
  const hasReferenceImage = Boolean(referenceImageUrl || referenceImageFilename);

  useEffect(() => {
    const refresh = () => {
      setPlates(loadPlates());
      setActivePlate(loadActivePlate());
    };
    refresh();
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!mounted || isolating) {
      return;
    }
    if (!isolateSubject) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (toolSettings.referenceIsolated === true) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    const originalUrl = referenceOriginalUrl || referenceImageUrl;
    const originalFilename = referenceOriginalFilename || referenceImageFilename;
    if (!originalUrl && !originalFilename) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (autoIsolateAttemptedRef.current) {
      return;
    }
    autoIsolateAttemptedRef.current = true;
    setIsolating(true);
    void (async () => {
      try {
        const originalName = originalFilename || 'roleplay-ref.png';
        const blob = await loadImageBlobFromUrls(
          collectIsolateSourceUrls({
            imageUrl: originalUrl || IDENTITY_MEDIA_URL,
            filename: originalName,
            comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
          })
        );
        const source = new File([blob], originalName, {
          type: blob.type || 'image/png',
          lastModified: Date.now(),
        });
        const originalUploaded = await resolveQueueInputImage({
          file: source,
          filename: originalName,
          model: shared.model,
        });
        const originalNameOnHost = originalUploaded?.filename?.trim() || originalName;
        const cutout = await isolateSubjectOnWhite(source, originalName);
        const cutoutUploaded = await resolveQueueInputImage({
          file: cutout,
          filename: cutout.name,
          model: shared.model,
        });
        const cutoutFilename = cutoutUploaded?.filename?.trim();
        if (!cutoutFilename) {
          throw new Error('Cut-out upload did not return a filename.');
        }
        const cutoutDurable = await persistIdentityImage({
          file: cutout,
          filename: cutoutFilename,
        });
        updateToolSettings({
          playAs: 'photo',
          isolateSubject: true,
          referenceIsolated: true,
          referenceOriginalFilename: originalNameOnHost,
          referenceOriginalUrl: originalUrl || referenceOriginalUrl,
          referenceImageFilename: cutoutFilename,
          referenceImageUrl: cutoutDurable || referenceImageUrl,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message} ${ISOLATE_QUEUE_BLOCKED_MESSAGE}`
            : ISOLATE_QUEUE_BLOCKED_MESSAGE
        );
      } finally {
        setIsolating(false);
      }
    })();
  }, [
    isolateSubject,
    isolating,
    mounted,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    shared.model,
    toolSettings.referenceIsolated,
    updateToolSettings,
  ]);

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: [bio?.name, toolSettings.setting].filter(Boolean).join(' · '),
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const requestBody = useCallback(
    (action: 'bio' | 'scenes' | 'prompt', situation?: RoleplayScene) =>
      buildRoleplayRequestBody({
        action,
        situation,
        shared,
        personaId,
        customPersona: toolSettings.customPersona,
        characterName: toolSettings.characterName,
        extraHints: toolSettings.extraHints,
        setting: toolSettings.setting,
        tone,
        content,
        allowGore: toolSettings.allowGore,
        hasReferenceImage,
        isolatedSubject:
          isolateSubject && hasReferenceImage && toolSettings.referenceIsolated === true,
        bio,
        story: toolSettings.story,
        rejectedScenes: scenes,
      }),
    [
      bio,
      content,
      hasReferenceImage,
      isolateSubject,
      personaId,
      shared,
      tone,
      toolSettings.allowGore,
      toolSettings.customPersona,
      toolSettings.characterName,
      toolSettings.extraHints,
      toolSettings.referenceIsolated,
      toolSettings.setting,
      toolSettings.story,
      scenes,
    ]
  );

  const queueStillOptions = useCallback(
    () =>
      buildRoleplayQueueStillOptions({
        photoMode: hasReferenceImage,
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        filename: referenceImageFilename,
        imageUrl: referenceImageUrl,
        identityLockStrength: shared.ipAdapterStrength,
        identityKind: shared.identityKind,
      }),
    [
      hasReferenceImage,
      isolateSubject,
      referenceImageFilename,
      referenceImageUrl,
      shared.identityKind,
      shared.ipAdapterStrength,
      toolSettings.referenceIsolated,
    ]
  );

  useRoleplayStorySync(storyRef, patch => updateToolSettings(patch));

  const commitStill = useCallback(
    async (
      data: RoleplayApiPayload,
      beat: RoleplayStoryBeat,
      nextBio: RoleplayBio,
      currentStory: RoleplayStoryBeat[]
    ) => {
      if (!data.prompt?.trim()) {
        throw new Error(data.error ?? 'Could not write a still.');
      }
      const prompt = await actions.finalizePrompt(data.prompt, beat.title);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Roleplay',
        href: '/m/play',
        fields: [nextBio.name, beat.title, prompt],
      });
      void dispatchWebhook({
        event: 'prompt.generated',
        tool: TOOL_ID,
        model: shared.model,
        prompt: prompt.slice(0, 500),
        completedAt: Date.now(),
      });
      let stillPatch: Partial<RoleplayStoryBeat> = { prompt };
      if (autoQueue) {
        const promptId = await actions.sendComfyUi(
          prompt,
          undefined,
          undefined,
          queueStillOptions()
        );
        stillPatch = {
          prompt,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
        };
      }
      const nextStory = patchRoleplayStoryBeat(currentStory, beat, stillPatch);
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [actions, autoQueue, queueStillOptions, shared.model, updateToolSettings]
  );

  const beginStoryFromBio = useCallback(
    async (nextBio: RoleplayBio) => {
      const intro = roleplayIntroScene(nextBio);
      const writingStory = appendRoleplayStoryBeat([], intro, { stillStatus: 'writing' });
      const introBeat = writingStory[writingStory.length - 1];
      updateToolSettings({
        playAs: 'photo',
        bio: nextBio,
        story: writingStory,
      });
      if (!introBeat) {
        return;
      }
      try {
        const [stillResponse, scenesResponse] = await Promise.all([
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('prompt', intro),
              bio: nextBio,
              story: [],
            }),
          }),
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('scenes'),
              bio: nextBio,
              story: writingStory,
            }),
          }).catch(() => null),
        ]);
        const stillData = (await stillResponse.json()) as RoleplayApiPayload;
        if (!stillResponse.ok || !stillData.prompt?.trim()) {
          throw new Error(stillData.error ?? 'Bio saved, but the first still failed.');
        }
        await commitStill(stillData, introBeat, nextBio, writingStory);
        if (scenesResponse) {
          const scenesData = (await scenesResponse.json()) as RoleplayApiPayload;
          setScenes(scenesResponse.ok && Array.isArray(scenesData.scenes) ? scenesData.scenes : []);
        }
      } catch (err) {
        updateToolSettings({
          story: patchRoleplayStoryBeat(writingStory, introBeat, { stillStatus: 'error' }),
        });
        throw err;
      }
    },
    [commitStill, requestBody, updateToolSettings]
  );

  const writeBio = useCallback(async () => {
    if (!hasReferenceImage) {
      setError('Capture a plate first.');
      return;
    }
    setBioLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody('bio')),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok || !data.bio) {
        throw new Error(data.error ?? 'Could not write a bio.');
      }
      await beginStoryFromBio(data.bio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a bio.');
    } finally {
      setBioLoading(false);
    }
  }, [beginStoryFromBio, hasReferenceImage, requestBody]);

  const applyOwnBible = useCallback(
    async (nextBio: RoleplayBio) => {
      if (!hasReferenceImage) {
        setError('Capture a plate first.');
        return;
      }
      setError(null);
      const hasPlot = Boolean(lastRoleplayPlotBeat(storyRef.current));
      if (hasPlot || storyRef.current.length > 0) {
        updateToolSettings({ bio: nextBio });
        setOwnBibleOpen(false);
        return;
      }
      setBioLoading(true);
      try {
        await beginStoryFromBio(nextBio);
        setOwnBibleOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start from this bible.');
      } finally {
        setBioLoading(false);
      }
    },
    [beginStoryFromBio, hasReferenceImage, updateToolSettings]
  );

  const playScene = useCallback(
    async (scene: RoleplayScene) => {
      if (!bio) {
        setError('Write a bio first.');
        return;
      }
      if (!hasReferenceImage) {
        setError('Capture a plate first.');
        return;
      }
      setPlayingId(scene.id);
      setError(null);
      const writingStory = appendRoleplayStoryBeat(storyRef.current, scene, {
        stillStatus: 'writing',
      });
      const beat = writingStory[writingStory.length - 1];
      if (!beat) {
        setPlayingId(null);
        return;
      }
      updateToolSettings({ story: writingStory });
      try {
        const response = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody('prompt', scene)),
        });
        const data = (await response.json()) as RoleplayApiPayload;
        if (!response.ok || !data.prompt?.trim()) {
          throw new Error(data.error ?? 'Could not write a still.');
        }
        const nextStory = await commitStill(data, beat, bio, writingStory);
        const nextScenes = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestBody('scenes'),
            story: nextStory,
          }),
        });
        const nextPayload = (await nextScenes.json()) as RoleplayApiPayload;
        if (nextScenes.ok && Array.isArray(nextPayload.scenes)) {
          setScenes(nextPayload.scenes);
        }
      } catch (err) {
        updateToolSettings({
          story: writingStory.filter(entry => entry.at !== beat.at || entry.prompt),
        });
        setError(err instanceof Error ? err.message : 'Could not play that scene.');
      } finally {
        setPlayingId(null);
      }
    },
    [bio, commitStill, hasReferenceImage, requestBody, updateToolSettings]
  );

  const queueBeat = useCallback(
    async (beat: RoleplayStoryBeat, options?: { retry?: boolean }) => {
      const prompt = beat.prompt?.trim();
      if (!prompt) {
        return;
      }
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = options?.retry === true || canRetryRoleplayStill(latest);
      setError(null);
      const startPatch = retry
        ? beginRoleplayStillRetryPatch(latest)
        : { stillStatus: 'writing' as const };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });
      const parentPromptId = retry
        ? roleplayStillTakes(latest)
            .map(take => take.promptId?.trim())
            .filter((id): id is string => Boolean(id))
            .at(-1)
        : undefined;
      const parentEntry = parentPromptId
        ? loadComfyGallery().find(entry => entry.promptId === parentPromptId)
        : undefined;
      let promptId: string | undefined;
      try {
        promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueStillOptions() ?? {}),
          ...(retry
            ? {
                derivedKind: 'variation' as const,
                parentGalleryEntryId: parentEntry?.id,
              }
            : {}),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue a still.');
      }
      const after = storyRef.current.find(
        entry => entry.id === latest.id && entry.at === latest.at
      ) ?? {
        ...latest,
        ...startPatch,
      };
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          roleplayStillQueueResultPatch(after, promptId)
        ),
      });
    },
    [actions, queueStillOptions, updateToolSettings]
  );

  const selectStillTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          selectRoleplayStillTakePatch(latest, index)
        ),
      });
    },
    [updateToolSettings]
  );

  const continueLibrarySession = useCallback(
    (session: RoleplayLibrarySession) => {
      persistRoleplayLibraryFromCache(toolSettings);
      updateToolSettings(applyRoleplayLibrarySession(session));
      setScenes([]);
      setOwnBibleOpen(false);
    },
    [toolSettings, updateToolSettings]
  );

  const startLibrarySession = useCallback(() => {
    const { next } = archiveAndStartNewRoleplaySession(toolSettings);
    updateToolSettings(next);
    setScenes([]);
    setOwnBibleOpen(false);
  }, [toolSettings, updateToolSettings]);

  if (!mounted) {
    return <p className="type-caption text-[var(--text-muted)]">Loading play…</p>;
  }

  const plateUrl =
    (activePlate?.isolated ? activePlate.isolatedUrl : activePlate?.originalUrl) ||
    referenceImageUrl;

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
          <p className="type-caption text-[var(--text-muted)]">Beats</p>
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

      <RoleplayStoryReel
        story={story}
        busy={bioLoading || playingId !== null}
        onQueue={beat => void queueBeat(beat)}
        onRetry={beat => void queueBeat(beat, { retry: true })}
        onSelectTake={selectStillTake}
      />

      <FieldError>{error}</FieldError>
      <Link href="/roleplay" className="ui-btn-ghost w-full justify-center text-center text-sm">
        Full Roleplay on desk
      </Link>
    </div>
  );
}
