"use client";

import { useCallback, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { DEFAULT_CONTROLNET_TOOL_CACHE } from "@/lib/settings-cache";
import { rememberDraftFields } from "@/lib/remember-draft-fields";
import {
  normalizeControlNetMode,
  type ControlNetMode,
} from "@/lib/controlnet-prompt";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldLabel } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";

const ACCENT = "cyan" as const;

const MODES: { id: ControlNetMode; label: string }[] = [
  { id: "depth", label: "Depth" },
  { id: "pose", label: "Pose" },
  { id: "canny", label: "Canny / edges" },
  { id: "normal", label: "Normal map" },
  { id: "lineart", label: "Lineart" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export default function ControlNetTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("controlnet", DEFAULT_CONTROLNET_TOOL_CACHE);
  const actions = usePromptResultActions({
    tool: "controlnet",
    model: shared.model,
    detail: shared.detail,
    hints: "",
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const mode = normalizeControlNetMode(toolSettings.mode);
  const subject = toolSettings.subject ?? "";
  const scene = toolSettings.scene ?? "";
  const detailNotes = toolSettings.detailNotes ?? "";
  const setMode = useCallback(
    (value: ControlNetMode) => updateToolSettings({ mode: value }),
    [updateToolSettings],
  );
  const setSubject = useCallback(
    (value: string) => {
      updateToolSettings({ subject: value });
      rememberDraftFields({
        toolKey: "controlnet",
        label: "ControlNet",
        href: "/controlnet",
        fields: [value, scene, detailNotes],
      });
    },
    [detailNotes, scene, updateToolSettings],
  );
  const setScene = useCallback(
    (value: string) => {
      updateToolSettings({ scene: value });
      rememberDraftFields({
        toolKey: "controlnet",
        label: "ControlNet",
        href: "/controlnet",
        fields: [subject, value, detailNotes],
      });
    },
    [detailNotes, subject, updateToolSettings],
  );
  const setDetailNotes = useCallback(
    (value: string) => {
      updateToolSettings({ detailNotes: value });
      rememberDraftFields({
        toolKey: "controlnet",
        label: "ControlNet",
        href: "/controlnet",
        fields: [subject, scene, value],
      });
    },
    [scene, subject, updateToolSettings],
  );
  useSeedToolDraft(mounted, {
    toolKey: "controlnet",
    label: "ControlNet",
    href: "/controlnet",
    fields: [subject, scene, detailNotes],
  });
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [source, setSource] = useState<"text" | "vision" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handoffQueueParams, setHandoffQueueParams] = useState<
    WorkflowParamValues | undefined
  >();

  const selectedModel = getComfyModelDefinition(shared.model);
  const hintText = [subject, scene, detailNotes].filter(Boolean).join(" · ");

  const onRefChange = useCallback(
    (file: File | null) => {
      if (refPreview) {
        URL.revokeObjectURL(refPreview);
      }
      setRefFile(file);
      setRefPreview(file ? URL.createObjectURL(file) : null);
    },
    [refPreview],
  );

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
    }) => {
      setOutput(handoff.prompt);
      setSubject(handoff.prompt.slice(0, 800));
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.model) {
        updateShared({ model: handoff.model as typeof shared.model });
      }
      if (handoff.file) {
        onRefChange(handoff.file);
      } else if (handoff.previewUrl) {
        setRefPreview(handoff.previewUrl);
      }
    },
    [onRefChange, updateShared],
  );

  useGalleryHandoff("controlnet", applyGalleryHandoff);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const payload: Record<string, unknown> = {
        mode,
        subject,
        scene,
        detail: detailNotes,
        model: shared.model,
        detailLevel: shared.detail,
      };
      if (refFile) {
        payload.image = await fileToDataUrl(refFile);
        payload.mimeType = refFile.type || "image/jpeg";
      }

      const response = await fetch("/api/controlnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        prompt?: string;
        error?: string;
        source?: "text" | "vision";
      };
      if (!response.ok) {
        throw new Error(data.error ?? "ControlNet prompt failed.");
      }

      const prompt = await actions.finalizePrompt(data.prompt ?? "", hintText);
      setOutput(prompt);
      setSource(data.source ?? (refFile ? "vision" : "text"));
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "ControlNet prompt failed.");
    } finally {
      setLoading(false);
    }
  }, [actions, detailNotes, hintText, mode, refFile, scene, shared.detail, shared.model, subject]);

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [output]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>ControlNet</ToolBadge>}
      title="ControlNet prompt builder"
      description="Structure-focused prompts for depth, pose, canny, normal, and lineart conditioning. Upload a reference image for vision-assisted structure extraction."
      sidebar={
        <SharedToolControls
          toolId="controlnet"
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detailLevel) => updateShared({ detail: detailLevel })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={(value) => updateShared({ autoFixRules: value })}
          recommendFromText={output || subject || scene}
        />
      }
    >
      <ToolSection title="Conditioning mode">
        <div className="flex flex-wrap gap-2">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMode(entry.id)}
              className={`ui-chip ${mode === entry.id ? "ui-chip-active" : ""}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </ToolSection>

      <ToolSection title="Reference image (optional)">
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onRefChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {refPreview ? (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={refPreview}
              alt="ControlNet reference"
              className="max-h-48 rounded-lg border border-zinc-800 object-contain"
            />
            <Button variant="ghost" onClick={() => onRefChange(null)}>
              Remove image
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            When uploaded, vision extracts structure and merges it with the selected ControlNet mode.
          </p>
        )}
      </ToolSection>

      <ToolSection title="Structure description">
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="controlnet-subject">Subject structure</FieldLabel>
            <textarea
              id="controlnet-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              rows={4}
              className={`ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body ${accentFocusClass(ACCENT)}`}
              placeholder="e.g. woman standing, weight on left leg, arms crossed — or leave blank when using image"
            />
          </div>
          <div>
            <FieldLabel htmlFor="controlnet-scene">Scene context (optional)</FieldLabel>
            <input
              id="controlnet-scene"
              value={scene}
              onChange={(event) => setScene(event.target.value)}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              placeholder="e.g. narrow alley, low camera angle"
            />
          </div>
          <div>
            <FieldLabel htmlFor="controlnet-detail">Extra constraints (optional)</FieldLabel>
            <input
              id="controlnet-detail"
              value={detailNotes}
              onChange={(event) => setDetailNotes(event.target.value)}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            loading={loading}
            disabled={!mounted || (!subject.trim() && !refFile)}
            onClick={() => void generate()}
            loadingLabel="Building ControlNet prompt"
          >
            Build ControlNet prompt
          </PrimaryButton>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </ToolSection>

      {output ? (
        <>
          {source === "vision" ? (
            <p className="text-xs text-cyan-300/80">
              Generated from reference image + {mode} mode
            </p>
          ) : null}
          <EnhancedPromptResult
            output={output}
            provider={source === "vision" ? "llm" : "rules"}
            comfyNode={selectedModel.comfyNode}
            readinessModel={shared.model}
            readinessDetail={shared.detail}
            readinessHints={hintText}
            copied={copied}
            onCopy={() => void copyOutput()}
            onOutputChange={setOutput}
            onSaveHistory={() => actions.saveHistory({ prompt: output, hints: hintText })}
            onSendComfyUi={() =>
              void actions.sendComfyUi(output, null, undefined, {
                controlImage: refFile,
                queueParamsBase: handoffQueueParams,
              })
            }
            onFixPrompt={() => void actions.fixPrompt(output, setOutput, hintText)}
            onCopyPair={() => void actions.copyPromptPair(output, null)}
            onCompact={() => void actions.compactPrompt(output, setOutput)}
            onReformat={() => void actions.reformatForModel(output, setOutput)}
            reformatTargetLabel={getReformatTargetLabel(shared.model)}
            onExportSidecar={() =>
              actions.exportSidecar(output, { metadata: { hints: hintText } })
            }
            {...promptResultPreviewProps(actions, output, null)}
            comfyUiStatus={actions.comfyUiStatus}
            comfyUiJob={actions.comfyUiJob}
            comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
            historySaved={actions.historySaved}
            pairCopied={actions.pairCopied}
          />
        </>
      ) : null}
    </ToolLayout>
  );
}
