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
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useVideoPromptInitImage, isFetchableImageRef } from '@/hooks/useVideoPromptInitImage';
import { useVideoPromptQueue } from '@/hooks/useVideoPromptQueue';
import VideoPromptInitImageSection from '@/components/video/VideoPromptInitImageSection';
import VideoPromptClipModeSection, {
  VideoPromptPromptFieldsSection,
  VideoPromptTimingFieldsSection,
} from '@/components/video/VideoPromptFormSections';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { DEFAULT_VIDEO_TOOL_CACHE, loadSettingsCache } from '@/lib/settings-cache';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { isVideoModel, resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { ensureVideoWorkflowScaffold } from '@/lib/ensure-video-workflow';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { inferVideoClipMode, type VideoClipMode } from '@/lib/video-clip-mode';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'brand' as const;

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

  const [parentGalleryEntryId, setParentGalleryEntryId] = useState<string | undefined>();
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  const {
    file,
    previewUrl,
    scanning,
    hasInitImage,
    pastedInitValue,
    clearInitImage,
    onInitFileChange,
    scanInitWithVision,
    setPreviewUrl,
    revokePreviewIfBlob,
  } = useVideoPromptInitImage({
    initImageUrl,
    setInitImageUrl,
    setParentVideoUrl,
    setParentGalleryEntryId,
    setClipMode,
    setSubject,
    setMotion,
    setError,
    updateShared,
    updateToolSettings,
    camera,
    style,
    shared,
  });

  const clipMode = inferVideoClipMode({
    clipMode: toolSettings.clipMode,
    hasInitImage,
  });

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

  const { loading, copied, inferenceEngine, generate, queueVideo, copyOutput } =
    useVideoPromptQueue({
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
    });

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
        <VideoPromptPromptFieldsSection
          accentFocusClassName={accentFocusClass(ACCENT)}
          subject={subject}
          motion={motion}
          camera={camera}
          style={style}
          durationSec={durationSec}
          falDurationPicker={
            shared.inferenceEngine === 'fal' || shared.inferenceEngine === 'replicate'
          }
          onSubjectChange={setSubject}
          onMotionChange={setMotion}
          onCameraChange={setCamera}
          onStyleChange={setStyle}
          onDurationSecChange={setDurationSec}
        />

        <VideoPromptClipModeSection
          clipMode={clipMode}
          inferenceEngine={inferenceEngine}
          parentVideoUrl={parentVideoUrl}
          onClipModeChange={setClipMode}
          onParentVideoUrlChange={setParentVideoUrl}
        />

        <VideoPromptInitImageSection
          clipMode={clipMode}
          file={file}
          previewUrl={previewUrl}
          pastedInitValue={pastedInitValue}
          hasInitImage={hasInitImage}
          scanning={scanning}
          loading={loading}
          onInitFileChange={onInitFileChange}
          onScanInitWithVision={() => void scanInitWithVision()}
          onClearInitImage={clearInitImage}
          onPastedInitChange={value => {
            setInitImageUrl(value);
            if (!file) {
              setPreviewUrl(current => {
                revokePreviewIfBlob(current);
                return isFetchableImageRef(value) ? value.trim() : null;
              });
            }
          }}
          revokePreviewIfBlob={revokePreviewIfBlob}
          setPreviewUrl={setPreviewUrl}
        />

        <VideoPromptTimingFieldsSection
          frames={frames}
          fps={fps}
          onFramesChange={setFrames}
          onFpsChange={setFps}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => void generate()}
          disabled={!mounted || !subject.trim() || scanning}
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
          onCopy={() => void copyOutput(output)}
          onOutputChange={setOutput}
          onSaveHistory={() => actions.saveHistory({ prompt: output, hints: motion })}
          onSendComfyUi={() => queueVideo(output)}
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
        onQueue={() => queueVideo(output)}
      />
    </ToolLayout>
  );
}
