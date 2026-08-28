'use client';

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { applyCharacterRecord, upsertCharacterFromRoleplaySession } from '@/lib/character-os';
import { loadEngineSettings } from '@/lib/engine-settings';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import { buildRoleplayQueueStillOptions, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  type RoleplayToolCache,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import {
  isSceneGenerationModel,
  resolvePreferredVideoModel,
  resolveTxt2iCounterpartForGenerate,
} from '@/lib/queue-tool-model';
import {
  beginRoleplayClipRetryPatch,
  beginRoleplayStillRetryPatch,
  canRetryRoleplayStill,
  lastCompletedRoleplayStillUrl,
  patchRoleplayStoryBeat,
  roleplayClipQueueResultPatch,
  roleplayClipTakes,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
  type RoleplayBio,
  type RoleplayPlayAs,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { shouldAutoQueueRoleplayClip, type RoleplayBeatOutput } from '@/lib/roleplay-film';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import { canFalExtendFromParentUrl } from '@/lib/video-clip-mode';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { snapshotRoleplaySession } from '@/lib/roleplay-library';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';

const TOOL_ID = 'roleplay';

type PromptActions = ReturnType<typeof usePromptResultActions>;

type UseRoleplayBeatQueueOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  toolSettings: RoleplayToolCache;
  updateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  shared: SharedToolSettings;
  actions: PromptActions;
  playAs: RoleplayPlayAs;
  referenceImageUrl: string;
  isolateSubject: boolean;
  referenceImageFilename: string;
  autoQueue: boolean;
  beatOutput: RoleplayBeatOutput;
  setError: (message: string | null) => void;
};

export function useRoleplayBeatQueue({
  storyRef,
  toolSettings,
  updateToolSettings,
  shared,
  actions,
  playAs,
  referenceImageUrl,
  isolateSubject,
  referenceImageFilename,
  autoQueue,
  beatOutput,
  setError,
}: UseRoleplayBeatQueueOptions) {
  const autoClipQueuedRef = useRef(new Set<string>());
  const queueBeatMotionRef = useRef<
    (
      beat: RoleplayStoryBeat,
      options?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => Promise<void>
  >(async () => undefined);

  const stampRoleplayCharacter = useCallback(
    (cache?: Partial<RoleplayToolCache>) => {
      const session = snapshotRoleplaySession({
        ...toolSettings,
        ...cache,
        story: cache?.story ?? storyRef.current,
        bio: cache?.bio ?? toolSettings.bio,
      });
      if (!session) {
        return undefined;
      }
      const character = upsertCharacterFromRoleplaySession(session);
      if (character) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecord(character),
        });
      }
      return character;
    },
    [storyRef, toolSettings]
  );

  const roleplayCharacterQueueFields = useCallback(
    (cache?: Partial<RoleplayToolCache>) => {
      const character = stampRoleplayCharacter(cache);
      if (!character) {
        return {};
      }
      return {
        characterId: character.id,
        lookId: character.activeLookId,
      };
    },
    [stampRoleplayCharacter]
  );

  const queueStillOptions = useCallback(
    () =>
      buildRoleplayQueueStillOptions({
        photoMode: playAs === 'photo',
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        filename: referenceImageFilename,
        imageUrl: referenceImageUrl,
        identityLockStrength: shared.ipAdapterStrength,
        identityKind: shared.identityKind,
      }),
    [
      isolateSubject,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.identityKind,
      shared.ipAdapterStrength,
      toolSettings.referenceIsolated,
    ]
  );

  const skipStillForClip = beatOutput === 'clip' && autoQueue;

  const commitStill = useCallback(
    async (
      data: RoleplayApiPayload,
      beat: RoleplayStoryBeat,
      nextBio: RoleplayBio,
      currentStory: RoleplayStoryBeat[],
      options?: { queueStill?: boolean }
    ) => {
      if (!data.prompt?.trim()) {
        throw new Error(data.error ?? 'Could not write a still.');
      }
      const prompt = await actions.finalizePrompt(data.prompt, beat.title);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Roleplay',
        href: '/roleplay',
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
      const queueStill = options?.queueStill ?? autoQueue;
      if (queueStill) {
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueStillOptions() ?? {}),
          ...roleplayCharacterQueueFields({ bio: nextBio, story: currentStory }),
        });
        stillPatch = {
          prompt,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
        };
      }
      const nextStory = patchRoleplayStoryBeat(currentStory, beat, stillPatch);
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [
      actions,
      autoQueue,
      queueStillOptions,
      roleplayCharacterQueueFields,
      shared.model,
      updateToolSettings,
    ]
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
          ...roleplayCharacterQueueFields(),
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
    [
      actions,
      queueStillOptions,
      roleplayCharacterQueueFields,
      setError,
      storyRef,
      updateToolSettings,
    ]
  );

  const queueBeatMotion = useCallback(
    async (
      beat: RoleplayStoryBeat,
      options?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = options?.retry === true;
      const stillUrl = lastCompletedRoleplayStillUrl(latest) || latest.imageUrl?.trim() || '';
      const source =
        retry || !options?.source
          ? stillUrl
            ? {
                imageUrl: stillUrl,
                parentPromptId: latest.promptId?.trim(),
                fromClip: false,
              }
            : playAs === 'photo' && referenceImageUrl
              ? { imageUrl: referenceImageUrl, fromClip: false }
              : null
          : options.source;
      const hasInit = Boolean(source?.imageUrl);
      if (!hasInit && !latest.prompt?.trim() && !latest.blurb?.trim()) {
        setError('Write a beat prompt, or add a still, before queueing a clip.');
        return;
      }

      const startPatch = retry
        ? beginRoleplayClipRetryPatch(latest)
        : { clipStatus: 'writing' as const };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });

      const engine = loadEngineSettings().engine;
      const parentClipUrl = source?.fromClip ? source.imageUrl : '';
      let extendUrl =
        engine === 'fal' && canFalExtendFromParentUrl(parentClipUrl) ? parentClipUrl : '';
      let falUploadNote: string | null = null;
      if (engine === 'fal' && !extendUrl && parentClipUrl && looksLikeVideoUrl(parentClipUrl)) {
        const resolved = await resolveFalExtendParentUrl({
          parentUrl: parentClipUrl,
          falApiKey: loadSettingsCache().shared.sessionFalApiKey,
        });
        if (resolved.url) {
          extendUrl = resolved.url;
        } else if (resolved.uploadAttempted) {
          falUploadNote =
            resolved.uploadError?.trim() ||
            'Could not upload that local clip to Fal for extend-video.';
        }
      }
      const useFalExtend = Boolean(extendUrl);
      if (falUploadNote && !useFalExtend) {
        setError(`${falUploadNote} Continuing from the last frame instead.`);
      }

      let inputImage: File | undefined;
      let inputImageUrl: string | undefined = useFalExtend ? undefined : source?.imageUrl;
      if (!useFalExtend && source?.imageUrl && looksLikeVideoUrl(source.imageUrl)) {
        try {
          const blob = await extractVideoLastFrame(source.imageUrl);
          inputImage = new File([blob], 'roleplay-last-frame.jpg', {
            type: blob.type || 'image/jpeg',
          });
          inputImageUrl = undefined;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not read the last frame.');
          updateToolSettings({
            story: patchRoleplayStoryBeat(
              storyRef.current,
              latest,
              roleplayClipQueueResultPatch(
                storyRef.current.find(
                  entry => entry.id === latest.id && entry.at === latest.at
                ) ?? {
                  ...latest,
                  ...startPatch,
                },
                undefined
              )
            ),
          });
          return;
        }
      }

      const parentClipPromptId = retry
        ? roleplayClipTakes(latest)
            .map(take => take.clipPromptId?.trim())
            .filter((id): id is string => Boolean(id))
            .at(-1)
        : source?.parentPromptId;
      const parentEntry = parentClipPromptId
        ? loadComfyGallery().find(entry => entry.promptId === parentClipPromptId)
        : latest.promptId
          ? loadComfyGallery().find(entry => entry.promptId === latest.promptId)
          : undefined;
      const videoModel = resolvePreferredVideoModel({
        toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
        sharedModel: shared.model,
      });
      if (!falUploadNote) {
        setError(null);
      }
      let prompt = latest.prompt?.trim() || latest.blurb;
      try {
        const response = await fetch('/api/video-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: latest.title,
            motion: latest.prompt?.trim() || latest.blurb,
            model: videoModel,
            durationSec: 4,
          }),
        });
        const data = (await response.json()) as { prompt?: string };
        if (data.prompt?.trim()) {
          prompt = data.prompt.trim();
        }
      } catch {
        /* use beat prompt */
      }
      let promptId: string | undefined;
      try {
        promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: videoModel,
          inputImage: hasInit ? inputImage : undefined,
          inputImageUrl: hasInit ? inputImageUrl : undefined,
          parentGalleryEntryId: parentEntry?.id,
          derivedKind: retry
            ? 'variation'
            : useFalExtend
              ? 'extend'
              : hasInit
                ? nextRoleplayMotionKind(parentEntry)
                : 't2v',
          clipMode: retry
            ? hasInit
              ? 'i2v'
              : 't2v'
            : useFalExtend
              ? 'extend'
              : hasInit
                ? 'i2v'
                : 't2v',
          videoUrl: retry || !useFalExtend ? undefined : extendUrl,
          qualityProfile: 'final',
          queueParamsBase: { videoFrames: 64, videoFps: 16 },
          ...roleplayCharacterQueueFields(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that clip.');
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
          roleplayClipQueueResultPatch(after, promptId)
        ),
      });
    },
    [
      actions,
      playAs,
      referenceImageUrl,
      roleplayCharacterQueueFields,
      setError,
      shared.model,
      storyRef,
      updateToolSettings,
    ]
  );

  useEffect(() => {
    queueBeatMotionRef.current = queueBeatMotion;
  }, [queueBeatMotion]);

  useEffect(() => {
    if (beatOutput !== 'clip' || !autoQueue) {
      return;
    }
    for (const beat of toolSettings.story ?? []) {
      const key = `${beat.id}:${beat.at}:${beat.imageUrl ?? ''}`;
      if (autoClipQueuedRef.current.has(key) || !shouldAutoQueueRoleplayClip(beat)) {
        continue;
      }
      autoClipQueuedRef.current.add(key);
      void queueBeatMotion(beat);
    }
  }, [autoQueue, beatOutput, queueBeatMotion, toolSettings.story]);

  return {
    skipStillForClip,
    commitStill,
    queueBeat,
    queueBeatMotion,
    queueBeatMotionRef,
    queueStillOptions,
    roleplayCharacterQueueFields,
    stampRoleplayCharacter,
  };
}

export function useRoleplayPhotoModelGuard(options: {
  mounted: boolean;
  playAs: RoleplayPlayAs;
  sharedModel: SharedToolSettings['model'];
  updateShared: (patch: Partial<SharedToolSettings>) => void;
}) {
  const { mounted, playAs, sharedModel, updateShared } = options;
  useEffect(() => {
    if (!mounted || playAs !== 'photo') {
      return;
    }
    if (isSceneGenerationModel(sharedModel)) {
      return;
    }
    const next = resolveTxt2iCounterpartForGenerate(sharedModel);
    if (next !== sharedModel) {
      updateShared({ model: next });
    }
  }, [mounted, playAs, sharedModel, updateShared]);
}
