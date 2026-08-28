'use client';

import { useCallback, useState } from 'react';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useVideoPromptInitImage, isFetchableImageRef } from '@/hooks/useVideoPromptInitImage';
import { useVideoPromptQueue } from '@/hooks/useVideoPromptQueue';
import { useVideoPromptFieldSetters } from '@/hooks/useVideoPromptFieldSetters';
import { useVideoWorkflowScaffold } from '@/hooks/useVideoWorkflowScaffold';
import { useVideoPromptModelSync } from '@/hooks/useVideoPromptModelSync';
import VideoPromptFormPanel from '@/components/video/VideoPromptFormPanel';
import VideoPromptResultSection from '@/components/video/VideoPromptResultSection';
import VideoPromptHistorySeedSection from '@/components/video/VideoPromptHistorySeedSection';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { DEFAULT_VIDEO_TOOL_CACHE } from '@/lib/settings-cache';
import { isVideoModel } from '@/lib/queue-tool-model';
import { ToolBadge, ToolLayout, accentFocusClass } from '@/components/ui/ToolPageShell';
import { inferVideoClipMode, type VideoClipMode } from '@/lib/video-clip-mode';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';

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

  const {
    setSubject,
    setMotion,
    setCamera,
    setStyle,
    setDurationSec,
    setInitImageUrl,
    setParentVideoUrl,
    setFrames,
    setFps,
    setVideoModel,
  } = useVideoPromptFieldSetters({
    subject,
    motion,
    camera,
    style,
    updateToolSettings,
    updateShared,
  });

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

  useSeedToolDraft(mounted, {
    toolKey: 'video',
    label: 'Video',
    href: '/video',
    fields: [subject, motion, camera, style],
  });

  const { controlsSharedModel } = useVideoPromptModelSync({
    mounted,
    sharedModel: shared.model,
    toolModel: toolSettings.model,
    updateShared,
    updateToolSettings,
  });

  useVideoWorkflowScaffold({
    mounted,
    toolModel: toolSettings.model,
    sharedModel: shared.model,
    updateShared,
    setWorkflowStatus,
  });

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
    : { ...shared, model: controlsSharedModel };

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
      <VideoPromptHistorySeedSection
        toolSettings={toolSettings}
        subject={subject}
        accentFocusClassName={accentFocusClass(ACCENT)}
        onSubjectChange={setSubject}
        onUpdateToolSettings={updateToolSettings}
      />
      <VideoPromptFormPanel
        mounted={mounted}
        shared={shared}
        workflowStatus={workflowStatus}
        subject={subject}
        motion={motion}
        camera={camera}
        style={style}
        durationSec={durationSec}
        clipMode={clipMode}
        inferenceEngine={inferenceEngine}
        parentVideoUrl={parentVideoUrl}
        frames={frames}
        fps={fps}
        file={file}
        previewUrl={previewUrl}
        pastedInitValue={pastedInitValue}
        hasInitImage={hasInitImage}
        scanning={scanning}
        loading={loading}
        error={error}
        onSharedPatch={updateShared}
        onWorkflowStatus={setWorkflowStatus}
        onSubjectChange={setSubject}
        onMotionChange={setMotion}
        onCameraChange={setCamera}
        onStyleChange={setStyle}
        onDurationSecChange={setDurationSec}
        onClipModeChange={setClipMode}
        onParentVideoUrlChange={setParentVideoUrl}
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
        onFramesChange={setFrames}
        onFpsChange={setFps}
        onGenerate={() => void generate()}
      />
      <VideoPromptResultSection
        output={output}
        motion={motion}
        model={shared.model}
        detail={shared.detail}
        copied={copied}
        actions={actions}
        onOutputChange={setOutput}
        onCopy={() => void copyOutput(output)}
        onQueue={() => queueVideo(output)}
      />
    </ToolLayout>
  );
}
