'use client';

import { useCallback, useState } from 'react';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { nextRoleplayMotionKind } from '@/lib/roleplay-film';
import {
  canFalExtendFromParentUrl,
  engineCanQueueClips,
  type VideoClipMode,
} from '@/lib/video-clip-mode';
import { engineDisplayName } from '@/lib/engine/capabilities';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import { loadEngineSettings } from '@/lib/engine-settings';
import { isFetchableImageRef, LOCAL_INIT_IMAGE_MARKER } from '@/hooks/useVideoPromptInitImage';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { SharedToolSettings } from '@/lib/settings-cache';

type PromptActions = ReturnType<typeof usePromptResultActions>;

type UseVideoPromptQueueOptions = {
  subject: string;
  motion: string;
  camera: string;
  style: string;
  durationSec: number;
  frames: number | undefined;
  fps: number | undefined;
  initImageUrl: string;
  parentVideoUrl: string;
  parentGalleryEntryId: string | undefined;
  file: File | null;
  previewUrl: string | null;
  hasInitImage: boolean;
  clipMode: VideoClipMode;
  shared: SharedToolSettings;
  actions: PromptActions;
  setError: (value: string | null) => void;
  setOutput: (value: string) => void;
};

export function useVideoPromptQueue({
  subject,
  motion,
  camera,
  style,
  durationSec,
  frames,
  fps,
  initImageUrl,
  parentVideoUrl,
  parentGalleryEntryId,
  file,
  previewUrl,
  hasInitImage,
  clipMode,
  shared,
  actions,
  setError,
  setOutput,
}: UseVideoPromptQueueOptions) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inferenceEngine = shared.inferenceEngine || loadEngineSettings().engine;

  const buildVideoQueueOptions = useCallback(() => {
    const initImage = initImageUrl.trim();
    const initImageIsFetchable =
      initImage !== LOCAL_INIT_IMAGE_MARKER && isFetchableImageRef(initImage);
    const previewIsFetchable = Boolean(previewUrl && isFetchableImageRef(previewUrl));
    const resolvedFps =
      typeof fps === 'number' && Number.isFinite(fps) && fps > 0 ? Math.floor(fps) : 16;
    const resolvedFrames =
      typeof frames === 'number' && Number.isFinite(frames) && frames > 0
        ? Math.floor(frames)
        : Math.max(1, Math.round(Math.max(1, Number(durationSec) || 4) * resolvedFps));

    const useInit = clipMode === 'i2v';
    return {
      inputImage: useInit ? file : undefined,
      inputImageUrl: useInit
        ? file
          ? undefined
          : previewIsFetchable
            ? previewUrl!
            : initImageIsFetchable
              ? initImage
              : undefined
        : undefined,
      inputImageFilename:
        useInit &&
        !file &&
        !previewIsFetchable &&
        !initImageIsFetchable &&
        initImage &&
        initImage !== LOCAL_INIT_IMAGE_MARKER
          ? initImage
          : undefined,
      queueParamsBase: {
        videoFrames: resolvedFrames,
        videoFps: resolvedFps,
      },
      parentGalleryEntryId,
      derivedKind:
        clipMode === 'extend'
          ? ('extend' as const)
          : parentGalleryEntryId
            ? nextRoleplayMotionKind(
                loadComfyGallery().find(entry => entry.id === parentGalleryEntryId)
              )
            : clipMode === 'i2v'
              ? ('i2v' as const)
              : ('t2v' as const),
      clipMode,
      videoUrl: clipMode === 'extend' ? parentVideoUrl.trim() || undefined : undefined,
    };
  }, [
    clipMode,
    durationSec,
    file,
    frames,
    fps,
    initImageUrl,
    parentGalleryEntryId,
    parentVideoUrl,
    previewUrl,
  ]);

  const queueVideo = useCallback(
    (output: string) => {
      if (!output.trim()) {
        return;
      }
      if (!engineCanQueueClips(inferenceEngine) && inferenceEngine !== 'comfyui') {
        setError(
          `${engineDisplayName(inferenceEngine)} cannot queue clips. Switch the inference engine to Fal, Replicate, Grok, Gemini, or local WAN (ComfyUI).`
        );
        return;
      }
      if (clipMode === 'i2v' && !hasInitImage) {
        setError('Image-to-video needs a first frame.');
        return;
      }
      if (clipMode === 'extend' && !parentVideoUrl.trim()) {
        setError('Extend needs a parent clip. Continue from Gallery or paste a clip URL.');
        return;
      }
      void (async () => {
        const options = buildVideoQueueOptions();
        if (
          clipMode === 'extend' &&
          inferenceEngine === 'fal' &&
          !canFalExtendFromParentUrl(parentVideoUrl)
        ) {
          const uploaded = await resolveFalExtendParentUrl({
            parentUrl: parentVideoUrl,
            falApiKey: shared.sessionFalApiKey,
          });
          if (!uploaded.url) {
            setError(
              uploaded.uploadError?.trim() ||
                'Could not upload that local clip to Fal. Continue from last frame instead, or use a Fal-hosted clip.'
            );
            return;
          }
          options.videoUrl = uploaded.url;
        }
        void actions.sendComfyUi(output, null, undefined, options);
      })();
    },
    [
      actions,
      buildVideoQueueOptions,
      clipMode,
      hasInitImage,
      inferenceEngine,
      parentVideoUrl,
      setError,
      shared.sessionFalApiKey,
    ]
  );

  const generate = useCallback(async () => {
    if (!subject.trim()) {
      setError('Describe the subject or action.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch('/api/video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          motion,
          camera,
          style,
          durationSec,
          model: shared.model,
        }),
      });
      const data = (await response.json()) as {
        prompt?: string;
        method?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Video prompt failed.');
      }
      const prompt = await actions.finalizePrompt(data.prompt ?? '', motion);
      setOutput(prompt);
      rememberDraftFields({
        toolKey: 'video',
        label: 'Video',
        href: '/video',
        fields: [prompt, subject, motion],
      });
    } catch (err) {
      setOutput('');
      setError(err instanceof Error ? err.message : 'Video prompt failed.');
    } finally {
      setLoading(false);
    }
  }, [actions, camera, durationSec, motion, setError, setOutput, shared.model, style, subject]);

  const copyOutput = useCallback(
    async (output: string) => {
      if (!output) {
        return;
      }
      try {
        await navigator.clipboard.writeText(output);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setError('Could not copy to clipboard.');
      }
    },
    [setError]
  );

  return {
    loading,
    copied,
    inferenceEngine,
    generate,
    queueVideo,
    copyOutput,
  };
}
