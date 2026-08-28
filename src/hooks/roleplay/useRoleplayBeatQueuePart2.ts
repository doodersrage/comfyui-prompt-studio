'use client';

import { useCallback, useEffect, useRef } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadEngineSettings } from '@/lib/engine-settings';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
} from '@/lib/settings-cache';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import {
  beginRoleplayClipRetryPatch,
  lastCompletedRoleplayStillUrl,
  patchRoleplayStoryBeat,
  roleplayClipQueueResultPatch,
  roleplayClipTakes,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import {
  looksLikeVideoUrl,
  nextRoleplayMotionKind,
  shouldAutoQueueRoleplayClip,
} from '@/lib/roleplay-film';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import { canFalExtendFromParentUrl } from '@/lib/video-clip-mode';
import type {
  RoleplayBeatQueueCore,
  UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueuePart2(
  options: UseRoleplayBeatQueueOptions,
  core: RoleplayBeatQueueCore
) {
  const {
    storyRef,
    toolSettings,
    updateToolSettings,
    shared,
    actions,
    playAs,
    referenceImageUrl,
    beatOutput,
    autoQueue,
    setError,
  } = options;
  const { roleplayCharacterQueueFields } = core;

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

  const queueBeatMotion = useCallback(
    async (
      beat: RoleplayStoryBeat,
      motionOptions?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = motionOptions?.retry === true;
      const stillUrl = lastCompletedRoleplayStillUrl(latest) || latest.imageUrl?.trim() || '';
      const source =
        retry || !motionOptions?.source
          ? stillUrl
            ? {
                imageUrl: stillUrl,
                parentPromptId: latest.promptId?.trim(),
                fromClip: false,
              }
            : playAs === 'photo' && referenceImageUrl
              ? { imageUrl: referenceImageUrl, fromClip: false }
              : null
          : motionOptions.source;
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
    queueBeatMotion,
    queueBeatMotionRef,
  };
}
