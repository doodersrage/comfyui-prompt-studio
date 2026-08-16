'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import MediaScaffoldReadyPanel from '@/components/MediaScaffoldReadyPanel';
import ComfyModelAssetsPanel from '@/components/settings/ComfyModelAssetsPanel';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { nextRoleplayMotionKind, looksLikeVideoUrl } from '@/lib/roleplay-film';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import { DEFAULT_VIDEO_TOOL_CACHE, loadSettingsCache } from '@/lib/settings-cache';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { isVideoModel, resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import {
  sharedPatchFromGalleryHandoff,
  galleryPickPath,
  type GalleryHandoffPayload,
} from '@/lib/gallery-handoff';
import { ensureVideoWorkflowScaffold } from '@/lib/ensure-video-workflow';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { ChipButton, FieldLabel, TextArea } from '@/components/ui/Field';
import {
  FAL_VIDEO_DURATION_SECONDS,
  canFalExtendFromParentUrl,
  engineCanQueueClips,
  inferVideoClipMode,
  snapFalVideoDurationSec,
  type VideoClipMode,
} from '@/lib/video-clip-mode';
import { loadEngineSettings, saveEngineSettings } from '@/lib/engine-settings';
import { preferCloudForVideoStillHandoff } from '@/lib/video-still-handoff';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import { engineDisplayName } from '@/lib/engine/capabilities';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'violet' as const;

const LOCAL_INIT_IMAGE_MARKER = 'local-upload';

function isFetchableImageRef(value: string): boolean {
  return /^(?:https?:|data:|blob:)/i.test(value.trim());
}

export default function VideoPromptTool() {
  const description = useToolPageDescription(
    'Motion and camera prompts for WAN / Hunyuan, or Fal / Replicate / Grok cloud T2V / I2V / extend. Pick a mode, then queue.',
    'Video motion prompts — T2V, I2V from a first frame, or extend a parent clip.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'video',
    DEFAULT_VIDEO_TOOL_CACHE
  );
  const subject = toolSettings.subject ?? '';
  const motion = toolSettings.motion ?? '';
  const camera = toolSettings.camera ?? '';
  const style = toolSettings.style ?? '';
  const durationSec = toolSettings.durationSec ?? 4;
  const initImageUrl = toolSettings.initImageUrl ?? '';
  const parentVideoUrl = toolSettings.parentVideoUrl ?? '';
  const frames = toolSettings.frames;
  const fps = toolSettings.fps;
  const inferenceEngine = shared.inferenceEngine || loadEngineSettings().engine;

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parentGalleryEntryId, setParentGalleryEntryId] = useState<string | undefined>();
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const clipMode = inferVideoClipMode({
    clipMode: toolSettings.clipMode,
    hasInitImage: Boolean(
      file || previewUrl || (initImageUrl.trim() && initImageUrl.trim() !== LOCAL_INIT_IMAGE_MARKER)
    ),
  });
  const setClipMode = useCallback(
    (mode: VideoClipMode) => updateToolSettings({ clipMode: mode }),
    [updateToolSettings]
  );

  const rememberVideoDraft = useCallback(
    (next: { subject?: string; motion?: string; camera?: string; style?: string }) => {
      rememberDraftFields({
        toolKey: 'video',
        label: 'Video',
        href: '/video',
        fields: [
          next.subject ?? subject,
          next.motion ?? motion,
          next.camera ?? camera,
          next.style ?? style,
        ],
      });
    },
    [camera, motion, style, subject]
  );

  const setSubject = useCallback(
    (value: string) => {
      updateToolSettings({ subject: value });
      rememberVideoDraft({ subject: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );
  const setMotion = useCallback(
    (value: string) => {
      updateToolSettings({ motion: value });
      rememberVideoDraft({ motion: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );
  const setCamera = useCallback(
    (value: string) => {
      updateToolSettings({ camera: value });
      rememberVideoDraft({ camera: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );
  const setStyle = useCallback(
    (value: string) => {
      updateToolSettings({ style: value });
      rememberVideoDraft({ style: value });
    },
    [rememberVideoDraft, updateToolSettings]
  );
  const setDurationSec = useCallback(
    (value: number) => updateToolSettings({ durationSec: value }),
    [updateToolSettings]
  );
  const setInitImageUrl = useCallback(
    (value: string) => updateToolSettings({ initImageUrl: value }),
    [updateToolSettings]
  );
  const setParentVideoUrl = useCallback(
    (value: string) => updateToolSettings({ parentVideoUrl: value }),
    [updateToolSettings]
  );

  const revokePreviewIfBlob = useCallback((url: string | null | undefined) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const clearInitImage = useCallback(() => {
    setFile(null);
    setPreviewUrl(current => {
      revokePreviewIfBlob(current);
      return null;
    });
    setInitImageUrl('');
    setParentVideoUrl('');
  }, [revokePreviewIfBlob, setInitImageUrl, setParentVideoUrl]);

  const onInitFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      setPreviewUrl(current => {
        revokePreviewIfBlob(current);
        return nextFile ? URL.createObjectURL(nextFile) : null;
      });
      // Keep Settings/preferI2v in sync — concrete upload happens at queue time.
      setInitImageUrl(nextFile ? LOCAL_INIT_IMAGE_MARKER : '');
      if (nextFile) {
        setClipMode('i2v');
      }
    },
    [revokePreviewIfBlob, setClipMode, setInitImageUrl]
  );

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: GalleryHandoffPayload;
    }) => {
      const framesFromHandoff = Number(handoff.queueParams?.videoFrames);
      const fpsFromHandoff = Number(handoff.queueParams?.videoFps);
      const imageRef =
        handoff.payload.imageUrl?.trim() ||
        handoff.previewUrl?.trim() ||
        (handoff.file ? LOCAL_INIT_IMAGE_MARKER : '');

      const rawUrl = handoff.payload.imageUrl?.trim() || handoff.previewUrl?.trim() || '';
      const parentIsVideo = Boolean(rawUrl && looksLikeVideoUrl(rawUrl));
      const engine = loadEngineSettings().engine;
      const useFalExtend = parentIsVideo && engine === 'fal' && canFalExtendFromParentUrl(rawUrl);

      updateToolSettings({
        ...(parentIsVideo ? { parentVideoUrl: rawUrl } : { parentVideoUrl: '' }),
        ...(useFalExtend
          ? { clipMode: 'extend' as const, initImageUrl: '' }
          : imageRef
            ? { initImageUrl: imageRef, clipMode: 'i2v' as const }
            : { clipMode: 'i2v' as const }),
        ...(handoff.prompt?.trim() ? { subject: handoff.prompt.trim().slice(0, 400) } : {}),
        ...(Number.isFinite(framesFromHandoff) && framesFromHandoff > 0
          ? { frames: Math.floor(framesFromHandoff) }
          : {}),
        ...(Number.isFinite(fpsFromHandoff) && fpsFromHandoff > 0
          ? { fps: Math.floor(fpsFromHandoff) }
          : {}),
      });
      void preferCloudForVideoStillHandoff().then(cloudEngine => {
        if (cloudEngine) {
          saveEngineSettings({ engine: cloudEngine });
          updateShared({ inferenceEngine: cloudEngine });
        }
      });

      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      const handoffModel = handoff.model?.trim() as ComfyImageModel | undefined;
      if (handoffModel && isVideoModel(handoffModel)) {
        updateShared({
          model: handoffModel,
          ...sharedPatch,
        });
        updateToolSettings({ model: handoffModel });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }

      setParentGalleryEntryId(handoff.payload.galleryEntryId?.trim() || undefined);

      if (useFalExtend) {
        setFile(null);
        setPreviewUrl(current => {
          revokePreviewIfBlob(current);
          return rawUrl;
        });
        return;
      }

      if (parentIsVideo) {
        void extractVideoLastFrame(rawUrl)
          .then(blob => {
            const nextFile = new File([blob], 'last-frame.jpg', {
              type: blob.type || 'image/jpeg',
            });
            setFile(nextFile);
            setPreviewUrl(current => {
              revokePreviewIfBlob(current);
              return URL.createObjectURL(nextFile);
            });
            setInitImageUrl(LOCAL_INIT_IMAGE_MARKER);
          })
          .catch(() => {
            setError('Could not read the last frame.');
            setPreviewUrl(current => {
              revokePreviewIfBlob(current);
              return handoff.previewUrl;
            });
            setFile(handoff.file);
          });
        return;
      }

      setPreviewUrl(current => {
        revokePreviewIfBlob(current);
        return handoff.previewUrl;
      });
      setFile(handoff.file);
    },
    [revokePreviewIfBlob, setError, setInitImageUrl, updateShared, updateToolSettings]
  );

  useGalleryHandoff('video', applyGalleryHandoff);

  const setFrames = useCallback(
    (value: number | undefined) => updateToolSettings({ frames: value }),
    [updateToolSettings]
  );
  const setFps = useCallback(
    (value: number | undefined) => updateToolSettings({ fps: value }),
    [updateToolSettings]
  );

  useSeedToolDraft(mounted, {
    toolKey: 'video',
    label: 'Video',
    href: '/video',
    fields: [subject, motion, camera, style],
  });

  const preferredVideoModel = resolvePreferredVideoModel({
    toolModel: toolSettings.model,
    sharedModel: shared.model,
  });

  const setVideoModel = useCallback(
    (model: ComfyImageModel) => {
      updateShared({ model });
      if (isVideoModel(model)) {
        updateToolSettings({ model });
      }
    },
    [updateShared, updateToolSettings]
  );

  // Video prompts/workflows only make sense against WAN/Hunyuan video
  // checkpoints. Restore the last Video-tool model (tool cache) instead of
  // always snapping to wan-video when another tool left a still-image model.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (isVideoModel(shared.model)) {
      if (!toolSettings.model || !isVideoModel(toolSettings.model)) {
        updateToolSettings({ model: shared.model });
      } else if (toolSettings.model !== shared.model) {
        updateShared({ model: toolSettings.model });
      }
      return;
    }
    if (preferredVideoModel !== shared.model) {
      updateShared({ model: preferredVideoModel });
    }
    if ((!toolSettings.model || !isVideoModel(toolSettings.model)) && preferredVideoModel) {
      updateToolSettings({ model: preferredVideoModel });
    }
  }, [
    mounted,
    preferredVideoModel,
    shared.model,
    toolSettings.model,
    updateShared,
    updateToolSettings,
  ]);

  // Create + assign a video scaffold when none is mapped yet.
  // Apply the sharedPatch (workflow/checkpoint maps) without clobbering the
  // user's last-selected video model or workflow picker.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const model = resolvePreferredVideoModel({
          toolModel: toolSettings.model,
          sharedModel: shared.model,
        });
        const objectInfo = await fetchComfyObjectInfoCached();
        if (cancelled) {
          return;
        }
        // Re-read after the network wait — user may have changed model.
        const latestShared = loadSettingsCache().shared.model;
        const ensureModel = resolvePreferredVideoModel({
          toolModel: toolSettings.model,
          sharedModel: latestShared,
          fallback: model,
        });
        const result = ensureVideoWorkflowScaffold(ensureModel, {
          inventory: objectInfo?.models ?? null,
        });
        if (cancelled) {
          return;
        }
        updateShared(result.sharedPatch);
        const parts = [
          result.created
            ? `Created and assigned “${result.workflow.name}” for ${result.model}.`
            : `Using workflow “${result.workflow.name}” for ${result.model}.`,
          result.checkpointNote,
        ].filter(Boolean);
        setWorkflowStatus(parts.join(' '));
      } catch (ensureError) {
        if (!cancelled) {
          setWorkflowStatus(
            ensureError instanceof Error
              ? ensureError.message
              : 'Could not create WAN video workflow scaffold.'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once after settings hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const actions = usePromptResultActions({
    tool: 'video',
    model: shared.model,
    detail: shared.detail,
    hints: motion,
    autoFixRules: shared.autoFixRules !== false,
  });

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

  const pastedInitValue = initImageUrl === LOCAL_INIT_IMAGE_MARKER ? '' : initImageUrl;
  const hasInitImage = Boolean(file || previewUrl || pastedInitValue.trim());

  const queueVideo = useCallback(() => {
    if (!output.trim()) {
      return;
    }
    if (
      !engineCanQueueClips(inferenceEngine) &&
      inferenceEngine !== 'comfyui' &&
      inferenceEngine !== 'diffusers'
    ) {
      setError(
        `${engineDisplayName(inferenceEngine)} cannot queue clips. Switch the inference engine to Fal, Replicate, Grok, Gemini, or local WAN.`
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
        if (!uploaded) {
          setError(
            'Could not upload that local clip to Fal. Continue from last frame instead, or use a Fal-hosted clip.'
          );
          return;
        }
        options.videoUrl = uploaded;
      }
      void actions.sendComfyUi(output, null, undefined, options);
    })();
  }, [
    actions,
    buildVideoQueueOptions,
    clipMode,
    hasInitImage,
    inferenceEngine,
    output,
    parentVideoUrl,
    setError,
    shared.sessionFalApiKey,
  ]);

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
  }, [actions, camera, durationSec, motion, setError, shared.model, style, subject]);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output, setError]);

  // Avoid first-paint crashes when shared.model is still audio/mesh/image
  // from another tool — effects sync storage, but controls need a video model now.
  const controlsShared = isVideoModel(shared.model)
    ? shared
    : { ...shared, model: preferredVideoModel };

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Video · motion prompts</ToolBadge>}
      title="Video"
      description={description}
      sidebar={
        <SharedToolControls
          shared={controlsShared}
          toolId="video"
          onModelChange={setVideoModel}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          onSharedSettingsChange={updateShared}
          recommendFromText={output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.video} />
      <EditToolRecipeStrip toolId="video" shared={shared} onApplied={next => updateShared(next)} />
      <HistoryHintSeedPanel
        tool="video"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={subject}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setSubject}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result => {
          setSubject(result.hints);
          updateToolSettings({
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          });
        }}
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <ToolSection>
        {workflowStatus ? (
          <p className="mb-3 rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2 text-xs text-[var(--tint-success-text)]">
            {workflowStatus}
          </p>
        ) : null}
        <div className="mb-4 space-y-3">
          <MediaScaffoldReadyPanel
            kind="video"
            onImported={(summary, result) => {
              if (result.sharedPatch) {
                updateShared(result.sharedPatch);
              }
              setWorkflowStatus(summary);
            }}
          />
          {isVideoModel(shared.model) ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-primary)]">
                Video model files
              </p>
              <ComfyModelAssetsPanel
                modelId={shared.model}
                compact
                onStatus={setWorkflowStatus}
                onInstalled={() => {
                  void (async () => {
                    try {
                      const { pinVideoWeightsAfterInstall } =
                        await import('@/lib/pin-video-weights');
                      const result = await pinVideoWeightsAfterInstall(shared.model);
                      if (result.sharedPatch) {
                        updateShared(result.sharedPatch);
                      }
                      setWorkflowStatus(
                        result.note ??
                          'Video weights installed and mapped — refresh ComfyUI if loaders stay empty.'
                      );
                    } catch (error) {
                      setWorkflowStatus(
                        error instanceof Error
                          ? error.message
                          : 'Video weights installed — refresh ComfyUI if loaders stay empty.'
                      );
                    }
                  })();
                }}
              />
            </div>
          ) : null}
        </div>
        <FieldLabel htmlFor="video-subject">Subject / action</FieldLabel>
        <TextArea
          id="video-subject"
          rows={3}
          value={subject}
          onChange={event => setSubject(event.target.value)}
          placeholder="A cyclist crests a foggy hill at dawn, pedaling steadily uphill…"
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel htmlFor="video-motion">Motion (optional)</FieldLabel>
        <TextArea
          id="video-motion"
          rows={2}
          value={motion}
          onChange={event => setMotion(event.target.value)}
          placeholder="Slow forward tracking, wheels spinning, jacket fluttering in wind…"
          className={accentFocusClass(ACCENT)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="video-camera">Camera (optional)</FieldLabel>
            <input
              id="video-camera"
              value={camera}
              onChange={event => setCamera(event.target.value)}
              placeholder="Low-angle follow shot, gentle dolly in"
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
          <div>
            <FieldLabel htmlFor="video-duration">Duration (seconds)</FieldLabel>
            {shared.inferenceEngine === 'fal' || shared.inferenceEngine === 'replicate' ? (
              <div className="flex flex-wrap gap-1.5">
                {FAL_VIDEO_DURATION_SECONDS.map(seconds => (
                  <ChipButton
                    key={seconds}
                    active={snapFalVideoDurationSec(durationSec) === seconds}
                    onClick={() => setDurationSec(seconds)}
                  >
                    {seconds}s
                  </ChipButton>
                ))}
              </div>
            ) : (
              <input
                id="video-duration"
                type="number"
                min={1}
                max={16}
                value={durationSec}
                onChange={event => setDurationSec(Number(event.target.value) || 4)}
                placeholder="e.g. 4"
                className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
              />
            )}
          </div>
        </div>

        <FieldLabel htmlFor="video-style">Look / style (optional)</FieldLabel>
        <input
          id="video-style"
          value={style}
          onChange={event => setStyle(event.target.value)}
          placeholder="Cinematic teal-orange grade, soft morning haze"
          className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
        />

        <div className="mb-4 space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--text-primary)]">Clip mode</p>
            <div className="flex flex-wrap gap-1.5">
              <ChipButton
                active={clipMode === 't2v'}
                title="Text-to-video — no first frame"
                onClick={() => setClipMode('t2v')}
              >
                Text to video
              </ChipButton>
              <ChipButton
                active={clipMode === 'i2v'}
                title="Image-to-video — first frame required"
                onClick={() => setClipMode('i2v')}
              >
                Image to video
              </ChipButton>
              <ChipButton
                active={clipMode === 'extend'}
                title="Extend a parent clip — Fal LTX extend-video when the URL is public, otherwise last-frame I2V"
                onClick={() => setClipMode('extend')}
              >
                Extend clip
              </ChipButton>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            {clipMode === 'extend'
              ? 'Needs a parent clip. Fal calls LTX extend-video when the parent is already a Fal URL (or after a documented CDN upload). Otherwise continue is last-frame I2V. Replicate has no extend API.'
              : clipMode === 'i2v'
                ? 'Needs a first frame. Local WAN / Hunyuan / LTX wire I2V nodes; Fal uses the I2V model in Settings.'
                : 'No still required. Local graphs stay T2V; Fal uses the T2V model in Settings.'}
          </p>
          {!engineCanQueueClips(inferenceEngine) &&
          inferenceEngine !== 'comfyui' &&
          inferenceEngine !== 'diffusers' ? (
            <p className="text-xs text-[var(--tint-warning-text)]">
              {engineDisplayName(inferenceEngine)} cannot queue clips. Switch Settings → Inference
              engine to Fal, Replicate, or local WAN.
            </p>
          ) : null}
        </div>

        {clipMode === 'extend' ? (
          <div className="mb-4 space-y-2">
            <FieldLabel
              htmlFor="video-parent-clip"
              hint="Public Fal clip URL, or a local / Gallery view URL (uploaded to Fal CDN when you queue)."
            >
              Parent clip (required, extend)
            </FieldLabel>
            <input
              id="video-parent-clip"
              value={parentVideoUrl}
              onChange={event => setParentVideoUrl(event.target.value)}
              placeholder="https://v3.fal.media/… or /api/comfyui/view?…"
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
            <p className="type-caption text-[var(--text-muted)]">
              {canFalExtendFromParentUrl(parentVideoUrl)
                ? 'Fal can extend this URL directly.'
                : parentVideoUrl.trim()
                  ? 'Local or non-Fal URL — queue uploads to Fal when the engine is Fal, otherwise last-frame I2V.'
                  : 'Continue from Gallery to fill this, or paste a clip URL.'}
            </p>
          </div>
        ) : null}

        <FieldLabel
          htmlFor="video-init-image"
          hint={
            clipMode === 'extend'
              ? 'Optional last-frame fallback when Fal extend is not available.'
              : clipMode === 'i2v'
                ? 'Required for I2V. Queue wires WanImageToVideo, HunyuanImageToVideo, or LTXVImgToVideo — or swaps in the built-in video scaffold when the selected graph is stills-only.'
                : 'Ignored in T2V mode. Switch to Image to video to use a first frame.'
          }
        >
          {clipMode === 'i2v' ? 'First frame (required, I2V)' : 'First frame (I2V only)'}
        </FieldLabel>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="video-init-image"
              type="file"
              accept="image/*"
              onChange={event => onInitFileChange(event.target.files?.[0] ?? null)}
              className="ui-file-input min-w-0 flex-1"
            />
            <ButtonLink href={galleryPickPath('video')} variant="secondary" size="sm">
              Choose from Gallery
            </ButtonLink>
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Opens Gallery in pick mode — click a completed still to return here as the I2V init
            image.
          </p>
          {previewUrl ? (
            <div className="flex flex-wrap items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Video init preview"
                className="max-h-48 rounded-xl border border-[var(--border-subtle)] object-contain shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              />
              <Button variant="ghost" size="sm" onClick={clearInitImage}>
                Remove image
              </Button>
            </div>
          ) : null}
          <div>
            <FieldLabel
              htmlFor="video-init-image-url"
              hint="Optional fallback when you already have a ComfyUI input filename or remote URL."
            >
              Or paste URL / Comfy filename
            </FieldLabel>
            <input
              id="video-init-image-url"
              value={pastedInitValue}
              onChange={event => {
                const next = event.target.value;
                setInitImageUrl(next);
                if (!file) {
                  setPreviewUrl(current => {
                    revokePreviewIfBlob(current);
                    return isFetchableImageRef(next) ? next.trim() : null;
                  });
                }
              }}
              placeholder="https://… or an uploaded ComfyUI filename"
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
          {clipMode === 'i2v' && hasInitImage ? (
            <p className="type-caption text-[var(--tint-success-text)]">
              I2V first frame ready — queue will upload and wire it into the video graph.
            </p>
          ) : null}
          {clipMode === 'i2v' && !hasInitImage ? (
            <p className="type-caption text-[var(--tint-warning-text)]">
              Add a first frame or pick a still from Gallery before queueing I2V.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel
              htmlFor="video-frames"
              hint="Patched into {{VIDEO_FRAMES}}. Leave empty to derive from duration × FPS."
            >
              Frames / length (optional)
            </FieldLabel>
            <input
              id="video-frames"
              type="number"
              min={1}
              max={480}
              value={frames ?? ''}
              onChange={event =>
                setFrames(event.target.value ? Number(event.target.value) : undefined)
              }
              placeholder="e.g. 81"
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="video-fps"
              hint="Patched into {{VIDEO_FPS}} (e.g. SaveAnimatedWEBP fps)."
            >
              FPS (optional)
            </FieldLabel>
            <input
              id="video-fps"
              type="number"
              min={1}
              max={60}
              value={fps ?? ''}
              onChange={event =>
                setFps(event.target.value ? Number(event.target.value) : undefined)
              }
              placeholder="e.g. 16"
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
        </div>

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => void generate()}
          disabled={!mounted || !subject.trim()}
          loading={loading}
          loadingLabel="Building video prompt"
          className="mt-4"
        >
          Build video prompt
        </PrimaryButton>
        {error ? <p className="mt-2 text-sm ui-status-danger">{error}</p> : null}
      </ToolSection>

      {output ? (
        <EnhancedPromptResult
          output={output}
          provider="rules"
          comfyNode="Video text encode"
          readinessModel={shared.model}
          readinessDetail={shared.detail}
          readinessHints={motion}
          copied={copied}
          onCopy={() => void copyOutput()}
          onOutputChange={setOutput}
          onSaveHistory={() => actions.saveHistory({ prompt: output, hints: motion })}
          onSendComfyUi={queueVideo}
          onExportSidecar={() => actions.exportSidecar(output, { metadata: { hints: motion } })}
          {...promptResultPreviewProps(actions, output, null)}
          {...continueEditResultProps(actions, output)}
          onFixPrompt={() => void actions.fixPrompt(output, setOutput, motion)}
          onCopyPair={() => void actions.copyPromptPair(output, null)}
          onReformat={() => void actions.reformatForModel(output, setOutput)}
          reformatTargetLabel={getReformatTargetLabel(shared.model)}
          onCompact={() => void actions.compactPrompt(output, setOutput)}
          comfyUiStatus={actions.comfyUiStatus}
          comfyUiJob={actions.comfyUiJob}
          comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
          historySaved={actions.historySaved}
        />
      ) : null}
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue video"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={queueVideo}
      />
    </ToolLayout>
  );
}
