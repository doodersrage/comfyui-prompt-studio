"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useEffect, useMemo, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import InpaintMaskEditor from "@/components/InpaintMaskEditor";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { ComfyImageModel } from "@/lib/comfy-models/client";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import { isComposeCapableModel } from "@/lib/model-denoise-defaults";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import {
  buildComposeInstruction,
  COMPOSE_DEFAULT_MODEL,
  COMPOSE_MODIFY_TEMPLATES,
  COMPOSE_TRANSFER_TEMPLATES,
  MAX_COMPOSE_FIGURES,
  type ComposeMode,
} from "@/lib/compose-prompt";
import {
  DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
  formatComposeIdentityLockHint,
  normalizeComposeIdentityLockStrength,
} from "@/lib/compose-identity-lock";
import { sharedPatchFromGalleryHandoff } from "@/lib/gallery-handoff";
import { DEFAULT_IMAGE_COMPOSE_TOOL_CACHE } from "@/lib/settings-cache";
import { rememberDraftFields } from "@/lib/remember-draft-fields";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "cyan" as const;

type FigureSlot = {
  file: File | null;
  previewUrl: string | null;
};

function emptySlots(): FigureSlot[] {
  return Array.from({ length: MAX_COMPOSE_FIGURES }, () => ({
    file: null,
    previewUrl: null,
  }));
}

export default function ComposeTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("imageCompose", DEFAULT_IMAGE_COMPOSE_TOOL_CACHE);

  const [slots, setSlots] = useState<FigureSlot[]>(emptySlots);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [handoffQueueParams, setHandoffQueueParams] = useState<
    WorkflowParamValues | undefined
  >();
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const instruction = toolSettings.instruction ?? "";
  const mode = (toolSettings.mode ?? "transfer") as ComposeMode;

  const setInstruction = useCallback(
    (value: string) => {
      updateToolSettings({ instruction: value });
      rememberDraftFields({
        toolKey: "compose",
        label: "Compose",
        href: "/compose",
        fields: [value],
      });
    },
    [updateToolSettings],
  );

  const setMode = useCallback(
    (next: ComposeMode) => {
      updateToolSettings({ mode: next });
    },
    [updateToolSettings],
  );

  useSeedToolDraft(mounted, {
    toolKey: "compose",
    label: "Compose",
    href: "/compose",
    fields: [instruction],
  });

  const actions = usePromptResultActions({
    tool: "compose",
    model: shared.model,
    detail: shared.detail,
    hints: instruction,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (!isComposeCapableModel(shared.model)) {
      updateShared({ model: COMPOSE_DEFAULT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const filledCount = useMemo(
    () => slots.filter((slot) => slot.file || slot.previewUrl).length,
    [slots],
  );

  useEffect(() => {
    if (filledCount > 0) {
      updateToolSettings({ figureCountHint: Math.max(1, filledCount) });
    }
  }, [filledCount, updateToolSettings]);

  const builtOutput = useMemo(
    () =>
      buildComposeInstruction({
        mode,
        instruction,
        figureCount: Math.max(filledCount, mode === "transfer" ? 2 : 1),
      }),
    [filledCount, instruction, mode],
  );

  useEffect(() => {
    setOutput(builtOutput);
  }, [builtOutput]);

  const clearMaskState = useCallback(() => {
    setMaskFile(null);
    setMaskPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const onMaskChange = useCallback((nextFile: File | null, nextPreviewUrl: string | null) => {
    setMaskFile(nextFile);
    setMaskPreviewUrl((current) => {
      if (current && current !== nextPreviewUrl) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
  }, []);

  const setFigure = useCallback(
    (index: number, nextFile: File | null) => {
      setSlots((current) => {
        const next = current.map((slot) => ({ ...slot }));
        const prev = next[index];
        if (prev?.previewUrl && prev.file) {
          URL.revokeObjectURL(prev.previewUrl);
        }
        next[index] = {
          file: nextFile,
          previewUrl: nextFile ? URL.createObjectURL(nextFile) : null,
        };
        return next;
      });
      if (index === 0) {
        clearMaskState();
      }
    },
    [clearMaskState],
  );

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      sessionActiveLoraIds?: string[];
      queueQualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile;
      handoffMode?: import("@/lib/gallery-handoff").GalleryHandoffMode;
      file: File | null;
      previewUrl: string | null;
      payload?: import("@/lib/gallery-handoff").GalleryHandoffPayload;
    }) => {
      if (handoff.prompt.trim()) {
        setInstruction(handoff.prompt.trim());
      }
      setHandoffQueueParams(handoff.queueParams);
      const sharedPatch = handoff.payload
        ? sharedPatchFromGalleryHandoff(handoff.payload)
        : {
            sessionActiveLoraIds: handoff.sessionActiveLoraIds,
            queueQualityProfile: handoff.queueQualityProfile,
          };
      if (handoff.model && isComposeCapableModel(handoff.model)) {
        updateShared({
          model: handoff.model as ComfyImageModel,
          ...sharedPatch,
        });
      } else {
        updateShared({
          model: COMPOSE_DEFAULT_MODEL,
          ...sharedPatch,
        });
      }
      setSlots((current) => {
        const next = current.map((slot) => ({ ...slot }));
        if (next[0]?.previewUrl && next[0].file) {
          URL.revokeObjectURL(next[0].previewUrl);
        }
        next[0] = {
          file: handoff.file,
          previewUrl: handoff.previewUrl,
        };
        return next;
      });
      clearMaskState();
    },
    [clearMaskState, setInstruction, updateShared],
  );

  useGalleryHandoff("compose", applyGalleryHandoff);

  const identityLock = toolSettings.identityLock === true;
  const identityLockStrength = normalizeComposeIdentityLockStrength(
    toolSettings.identityLockStrength ?? DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
  );

  const queueImageOptions = useMemo(() => {
    const fig1 = slots[0];
    return {
      inputImage: fig1?.file ?? null,
      inputImageUrl: !fig1?.file ? fig1?.previewUrl ?? undefined : undefined,
      inputImages: slots.map((slot) => slot.file),
      inputImageUrls: slots.map((slot) =>
        !slot.file ? slot.previewUrl ?? undefined : undefined,
      ),
      maskImage: showMaskEditor ? maskFile : undefined,
      maskImageUrl:
        showMaskEditor && !maskFile ? maskPreviewUrl ?? undefined : undefined,
      queueParamsBase: handoffQueueParams,
      identityLock,
      identityLockStrength,
    };
  }, [
    handoffQueueParams,
    identityLock,
    identityLockStrength,
    maskFile,
    maskPreviewUrl,
    showMaskEditor,
    slots,
  ]);

  const assertReadyToQueue = useCallback(() => {
    const fig1 = slots[0];
    if (!fig1?.file && !fig1?.previewUrl) {
      setError("Upload Figure 1 (base image) before queueing.");
      return false;
    }
    if (mode === "transfer" && filledCount < 2) {
      setError("Transfer mode needs at least Figure 1 and Figure 2.");
      return false;
    }
    if (!output.trim()) {
      setError("Add an edit instruction before queueing.");
      return false;
    }
    setError(null);
    return true;
  }, [filledCount, mode, output, slots]);

  const applyTemplate = useCallback(
    (text: string) => {
      setInstruction(text);
    },
    [setInstruction],
  );

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

  const templates = mode === "transfer" ? COMPOSE_TRANSFER_TEMPLATES : COMPOSE_MODIFY_TEMPLATES;
  const fig1Preview = slots[0]?.previewUrl ?? null;

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Compose · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Compose / Transfer"
      description={
        <>
          Upload up to four reference figures and describe a transfer or single-image edit.
          Defaults to Qwen Edit 2511 Lightning 8 with optional mask on Figure 1.
        </>
      }
      sidebar={
        <SharedToolControls
          toolId="compose"
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || instruction}
          onSharedSettingsChange={updateShared}
        />
      }
    >
      <ToolSection>
        <FieldLabel>Mode</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "transfer" as const, label: "Transfer", hint: "≥2 figures" },
              { id: "modify" as const, label: "Modify", hint: "Figure 1 only" },
            ] as const
          ).map((entry) => {
            const active = mode === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setMode(entry.id)}
                className={[
                  "rounded-xl border px-3.5 py-2 text-sm transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                  active
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-50 shadow-[0_0_24px_-12px_rgba(34,211,238,0.55)]"
                    : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-200",
                ].join(" ")}
              >
                <span className="font-medium">{entry.label}</span>
                <span className="ml-2 text-xs opacity-70">{entry.hint}</span>
              </button>
            );
          })}
        </div>

        <FieldLabel hint="Figure 1 is the base canvas. Figures 2–4 are optional donors.">
          Figures
        </FieldLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((slot, index) => {
            const required = index === 0 || (mode === "transfer" && index === 1);
            const disabled = mode === "modify" && index > 0;
            return (
              <div
                key={`figure-${index + 1}`}
                className={[
                  "rounded-2xl border p-3 transition",
                  disabled
                    ? "border-zinc-900/80 bg-zinc-950/20 opacity-45"
                    : "border-zinc-800/80 bg-gradient-to-b from-zinc-900/50 to-zinc-950/40",
                ].join(" ")}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">
                    Figure {index + 1}
                    {required ? (
                      <span className="ml-1.5 text-xs font-normal text-cyan-300/80">
                        required
                      </span>
                    ) : null}
                  </p>
                  {slot.previewUrl ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setFigure(index, null)}
                      className="rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800/80 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:pointer-events-none"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={disabled}
                  onChange={(event) =>
                    setFigure(index, event.target.files?.[0] ?? null)
                  }
                  className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-700/80 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-50"
                />
                {slot.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slot.previewUrl}
                    alt={`Figure ${index + 1} preview`}
                    className="mt-3 max-h-40 w-full rounded-xl border border-zinc-800/80 object-contain"
                  />
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">
                    {index === 0
                      ? "Base / canvas image"
                      : `Optional donor for transfer`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] px-3.5 py-3 shadow-[0_0_28px_-18px_rgba(34,211,238,0.4)]">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={identityLock}
              onChange={(event) =>
                updateToolSettings({ identityLock: event.target.checked })
              }
              className="mt-1 rounded border-zinc-700 bg-zinc-950 text-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            />
            <span className="min-w-0 space-y-1">
              <span className="block text-sm font-medium text-cyan-50/95">
                Lock identity from Figure 1
              </span>
              <span className="block text-xs leading-relaxed text-zinc-500">
                {formatComposeIdentityLockHint({
                  enabled: identityLock,
                  strength: identityLockStrength,
                })}
              </span>
            </span>
          </label>
          {identityLock ? (
            <label className="block space-y-1.5 pl-7">
              <span className="type-caption text-cyan-200/70">
                IP-Adapter strength — {identityLockStrength.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.15}
                max={0.85}
                step={0.05}
                value={identityLockStrength}
                onChange={(event) =>
                  updateToolSettings({
                    identityLockStrength: normalizeComposeIdentityLockStrength(
                      event.target.value,
                    ),
                  })
                }
                className="w-full accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMaskEditor((value) => !value)}
            disabled={!fig1Preview}
            className={[
              "rounded-xl border px-3 py-2 text-sm transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
              "disabled:cursor-not-allowed disabled:opacity-40",
              showMaskEditor
                ? "border-cyan-400/35 bg-cyan-500/10 text-cyan-100"
                : "border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
            ].join(" ")}
          >
            {showMaskEditor ? "Hide optional mask" : "Optional mask on Figure 1"}
          </button>
          {maskPreviewUrl ? (
            <span className="text-xs text-zinc-500">Mask ready</span>
          ) : null}
        </div>

        {showMaskEditor && fig1Preview ? (
          <InpaintMaskEditor
            key={fig1Preview}
            sourceImageUrl={fig1Preview}
            onMaskChange={onMaskChange}
          />
        ) : null}

        <FieldLabel>Starter templates</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => applyTemplate(template.instruction)}
              className="rounded-xl border border-zinc-800/90 bg-zinc-950/45 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 active:scale-[0.98]"
            >
              {template.label}
            </button>
          ))}
        </div>

        <FieldLabel>
          {mode === "transfer" ? "Transfer instruction" : "Modify instruction"}
        </FieldLabel>
        <TextArea
          rows={5}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={
            mode === "transfer"
              ? "Keep pose from Figure 1. Apply the jacket from Figure 2…"
              : "keep: subject face and pose\nreplace: background with misty forest…"
          }
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => {
            if (!assertReadyToQueue()) {
              return;
            }
            void actions.finalizePrompt(output, instruction).then((finalized) => {
              setOutput(finalized);
            });
          }}
          disabled={!instruction.trim()}
        >
          Prepare instruction
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        provider={output ? "llm" : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: instruction,
          })
        }
        onSendComfyUi={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, instruction)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.runExportPipeline(output, setOutput, {
            queueComfyUi: true,
            ...queueImageOptions,
          });
        }}
        onExportSidecar={() =>
          void actions.exportSidecar(output, { comfyNode: selectedModel.comfyNode })
        }
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        historySaved={actions.historySaved}
        pairCopied={actions.pairCopied}
      />
    </ToolLayout>
  );
}
