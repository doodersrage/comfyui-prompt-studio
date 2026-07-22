"use client";

import { useCallback, useEffect, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import SharedToolControls from "@/components/SharedToolControls";
import MobileStickyQueueBar from "@/components/MobileStickyQueueBar";
import ComfyPackImportControl from "@/components/ComfyPackImportControl";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { getReformatTargetLabel } from "@/lib/reformat-target";
import { rememberDraftFields } from "@/lib/remember-draft-fields";
import { DEFAULT_VIDEO_TOOL_CACHE } from "@/lib/settings-cache";
import { isVideoModel } from "@/lib/queue-tool-model";
import {
  DEFAULT_VIDEO_MODEL,
  type ComfyImageModel,
} from "@/lib/comfy-models/client";
import {
  clearGalleryHandoff,
  loadGalleryHandoff,
  sharedPatchFromGalleryHandoff,
} from "@/lib/gallery-handoff";
import { ensureVideoWorkflowScaffold } from "@/lib/ensure-video-workflow";
import { fetchComfyObjectInfoCached } from "@/lib/comfyui-object-info-cache";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldLabel, TextArea } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "violet" as const;

export default function VideoPromptTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("video", DEFAULT_VIDEO_TOOL_CACHE);
  const subject = toolSettings.subject ?? "";
  const motion = toolSettings.motion ?? "";
  const camera = toolSettings.camera ?? "";
  const style = toolSettings.style ?? "";
  const durationSec = toolSettings.durationSec ?? 4;
  const initImageUrl = toolSettings.initImageUrl ?? "";
  const frames = toolSettings.frames;
  const fps = toolSettings.fps;

  const rememberVideoDraft = useCallback(
    (next: {
      subject?: string;
      motion?: string;
      camera?: string;
      style?: string;
    }) => {
      rememberDraftFields({
        toolKey: "video",
        label: "Video",
        href: "/video",
        fields: [
          next.subject ?? subject,
          next.motion ?? motion,
          next.camera ?? camera,
          next.style ?? style,
        ],
      });
    },
    [camera, motion, style, subject],
  );

  const setSubject = useCallback(
    (value: string) => {
      updateToolSettings({ subject: value });
      rememberVideoDraft({ subject: value });
    },
    [rememberVideoDraft, updateToolSettings],
  );
  const setMotion = useCallback(
    (value: string) => {
      updateToolSettings({ motion: value });
      rememberVideoDraft({ motion: value });
    },
    [rememberVideoDraft, updateToolSettings],
  );
  const setCamera = useCallback(
    (value: string) => {
      updateToolSettings({ camera: value });
      rememberVideoDraft({ camera: value });
    },
    [rememberVideoDraft, updateToolSettings],
  );
  const setStyle = useCallback(
    (value: string) => {
      updateToolSettings({ style: value });
      rememberVideoDraft({ style: value });
    },
    [rememberVideoDraft, updateToolSettings],
  );
  const setDurationSec = useCallback(
    (value: number) => updateToolSettings({ durationSec: value }),
    [updateToolSettings],
  );
  const setInitImageUrl = useCallback(
    (value: string) => updateToolSettings({ initImageUrl: value }),
    [updateToolSettings],
  );

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const handoff = loadGalleryHandoff("video");
    if (!handoff) {
      return;
    }
    const framesFromHandoff = Number(handoff.queueParams?.videoFrames);
    const fpsFromHandoff = Number(handoff.queueParams?.videoFps);
    updateToolSettings({
      ...(handoff.imageUrl?.trim()
        ? { initImageUrl: handoff.imageUrl.trim() }
        : {}),
      ...(handoff.prompt?.trim()
        ? { subject: handoff.prompt.trim().slice(0, 400) }
        : {}),
      ...(Number.isFinite(framesFromHandoff) && framesFromHandoff > 0
        ? { frames: Math.floor(framesFromHandoff) }
        : {}),
      ...(Number.isFinite(fpsFromHandoff) && fpsFromHandoff > 0
        ? { fps: Math.floor(fpsFromHandoff) }
        : {}),
    });
    const sharedPatch = sharedPatchFromGalleryHandoff(handoff);
    if (handoff.model?.trim()) {
      updateShared({
        model: handoff.model.trim() as ComfyImageModel,
        ...sharedPatch,
      });
    } else if (Object.keys(sharedPatch).length > 0) {
      updateShared(sharedPatch);
    }
    clearGalleryHandoff();
  }, [mounted, updateShared, updateToolSettings]);
  const setFrames = useCallback(
    (value: number | undefined) => updateToolSettings({ frames: value }),
    [updateToolSettings],
  );
  const setFps = useCallback(
    (value: number | undefined) => updateToolSettings({ fps: value }),
    [updateToolSettings],
  );

  useSeedToolDraft(mounted, {
    toolKey: "video",
    label: "Video",
    href: "/video",
    fields: [subject, motion, camera, style],
  });

  // Video prompts/workflows only make sense against WAN/Hunyuan video
  // checkpoints — steer the shared model picker to a video model the moment
  // this tool is open, rather than silently queueing against whatever
  // still-image model another tool last left selected.
  useEffect(() => {
    if (!mounted || isVideoModel(shared.model)) {
      return;
    }
    updateShared({ model: DEFAULT_VIDEO_MODEL });
  }, [mounted, shared.model, updateShared]);

  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create + assign a WAN video scaffold when none is mapped yet.
  // Apply the full sharedPatch (including modelWorkflowMap + checkpoint map)
  // so React state does not clobber settings with a stale partial update.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const model = isVideoModel(shared.model) ? shared.model : DEFAULT_VIDEO_MODEL;
        const objectInfo = await fetchComfyObjectInfoCached();
        if (cancelled) {
          return;
        }
        const result = ensureVideoWorkflowScaffold(model, {
          inventory: objectInfo?.models ?? null,
        });
        updateShared(result.sharedPatch);
        const parts = [
          result.created
            ? `Created and assigned “${result.workflow.name}” for ${result.model}.`
            : `Using workflow “${result.workflow.name}” for ${result.model}.`,
          result.checkpointNote,
        ].filter(Boolean);
        setWorkflowStatus(parts.join(" "));
      } catch (ensureError) {
        if (!cancelled) {
          setWorkflowStatus(
            ensureError instanceof Error
              ? ensureError.message
              : "Could not create WAN video workflow scaffold.",
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
    tool: "video",
    model: shared.model,
    detail: shared.detail,
    hints: motion,
    autoFixRules: shared.autoFixRules !== false,
  });

  const generate = useCallback(async () => {
    if (!subject.trim()) {
      setError("Describe the subject or action.");
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch("/api/video-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        throw new Error(data.error ?? "Video prompt failed.");
      }
      const prompt = await actions.finalizePrompt(data.prompt ?? "", motion);
      setOutput(prompt);
      rememberDraftFields({
        toolKey: "video",
        label: "Video",
        href: "/video",
        fields: [prompt, subject, motion],
      });
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Video prompt failed.");
    } finally {
      setLoading(false);
    }
  }, [subject, motion, camera, style, durationSec, actions]);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [output]);

  // Avoid first-paint crashes when shared.model is still audio/mesh/image
  // from another tool — effects sync storage, but controls need a video model now.
  const controlsShared = isVideoModel(shared.model)
    ? shared
    : { ...shared, model: DEFAULT_VIDEO_MODEL as ComfyImageModel };

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Video · motion prompts</ToolBadge>}
      title="Video prompt builder"
      description="Compose motion, camera, and continuity prompts for WAN / Hunyuan Video. Text-to-video by default; add an init image for image-to-video (requires WanImageToVideo or HunyuanImageToVideo in ComfyUI)."
      sidebar={
        <SharedToolControls
          shared={controlsShared}
          toolId="video"
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={(value) => updateShared({ autoFixRules: value })}
          onSharedSettingsChange={updateShared}
          recommendFromText={output}
        />
      }
    >
      <ToolSection>
        {workflowStatus ? (
          <p className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {workflowStatus}
          </p>
        ) : null}
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <ComfyPackImportControl
            preferKind="video"
            compact
            onImported={(summary, result) => {
              if (result.sharedPatch) {
                updateShared(result.sharedPatch);
              }
              setWorkflowStatus(summary);
            }}
          />
        </div>
        <FieldLabel htmlFor="video-subject">Subject / action</FieldLabel>
        <TextArea
          id="video-subject"
          rows={3}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="A cyclist crests a foggy hill at dawn, pedaling steadily uphill…"
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel htmlFor="video-motion">Motion (optional)</FieldLabel>
        <TextArea
          id="video-motion"
          rows={2}
          value={motion}
          onChange={(event) => setMotion(event.target.value)}
          placeholder="Slow forward tracking, wheels spinning, jacket fluttering in wind…"
          className={accentFocusClass(ACCENT)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="video-camera">Camera (optional)</FieldLabel>
            <input
              id="video-camera"
              value={camera}
              onChange={(event) => setCamera(event.target.value)}
              placeholder="Low-angle follow shot, gentle dolly in"
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
          <div>
            <FieldLabel htmlFor="video-duration">Duration (seconds)</FieldLabel>
            <input
              id="video-duration"
              type="number"
              min={1}
              max={16}
              value={durationSec}
              onChange={(event) => setDurationSec(Number(event.target.value) || 4)}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
        </div>

        <FieldLabel htmlFor="video-style">Look / style (optional)</FieldLabel>
        <input
          id="video-style"
          value={style}
          onChange={(event) => setStyle(event.target.value)}
          placeholder="Cinematic teal-orange grade, soft morning haze"
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />

        <FieldLabel
          htmlFor="video-init-image"
          hint="Optional. With an init image, queue hard-fails unless ComfyUI can wire WanImageToVideo / HunyuanImageToVideo. LTX Video is T2V-only unless you import an LTXVImgToVideo pack. Without an init image, the job is text-to-video."
        >
          Init image (optional, I2V)
        </FieldLabel>
        <input
          id="video-init-image"
          value={initImageUrl}
          onChange={(event) => setInitImageUrl(event.target.value)}
          placeholder="https://… or an uploaded ComfyUI filename"
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />

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
              value={frames ?? ""}
              onChange={(event) =>
                setFrames(event.target.value ? Number(event.target.value) : undefined)
              }
              placeholder="e.g. 81"
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
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
              value={fps ?? ""}
              onChange={(event) =>
                setFps(event.target.value ? Number(event.target.value) : undefined)
              }
              placeholder="e.g. 16"
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
        </div>

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          disabled={!mounted || !subject.trim()}
          loading={loading}
          loadingLabel="Building video prompt"
          className="mt-4"
        >
          Build video prompt
        </PrimaryButton>
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
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
          onSendComfyUi={() => {
            const initImage = initImageUrl.trim();
            // Both http(s) URLs and data: URLs (e.g. pasted/dragged image data)
            // go through the ComfyUI upload helper; anything else is treated
            // as an already-uploaded filename on the ComfyUI server.
            const initImageIsFetchable = /^(?:https?:|data:)/i.test(initImage);
            const resolvedFps =
              typeof fps === "number" && Number.isFinite(fps) && fps > 0
                ? Math.floor(fps)
                : 16;
            const resolvedFrames =
              typeof frames === "number" && Number.isFinite(frames) && frames > 0
                ? Math.floor(frames)
                : Math.max(
                    1,
                    Math.round(
                      Math.max(1, Number(durationSec) || 4) * resolvedFps,
                    ),
                  );
            void actions.sendComfyUi(output, null, undefined, {
              inputImageUrl: initImageIsFetchable ? initImage : undefined,
              inputImageFilename:
                !initImageIsFetchable && initImage ? initImage : undefined,
              queueParamsBase: {
                videoFrames: resolvedFrames,
                videoFps: resolvedFps,
              },
            });
          }}
          onExportSidecar={() =>
            actions.exportSidecar(output, { metadata: { hints: motion } })
          }
          {...promptResultPreviewProps(actions, output, null)}
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
        onQueue={() => void actions.sendComfyUi(output)}
      />
    </ToolLayout>
  );
}
