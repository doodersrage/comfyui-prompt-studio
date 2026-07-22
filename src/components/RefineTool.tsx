"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useMemo, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import InpaintMaskEditor from "@/components/InpaintMaskEditor";
import RegionalEditPanel, {
  regionalSlotsQueueExtras,
} from "@/components/RegionalEditPanel";
import SharedToolControls from "@/components/SharedToolControls";
import MobileStickyQueueBar from "@/components/MobileStickyQueueBar";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { ComfyImageModel } from "@/lib/comfy-models/client";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import { isInpaintModel } from "@/lib/model-denoise-defaults";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { diffPromptWords } from "@/lib/prompt-diff";
import { resolveParentHistoryId } from "@/lib/prompt-lineage-session";
import { DEFAULT_REFINE_TOOL_CACHE } from "@/lib/settings-cache";
import { createDefaultRegionalSlots } from "@/lib/regional-prompt-slots";
import { sharedPatchFromGalleryHandoff } from "@/lib/gallery-handoff";
import type { GalleryHandoffPayload } from "@/lib/gallery-handoff";
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

const ACCENT = "fuchsia" as const;

export default function RefineTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("refine", DEFAULT_REFINE_TOOL_CACHE);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const currentPrompt = toolSettings.currentPrompt ?? "";
  const intentHints = toolSettings.intentHints ?? "";
  const setCurrentPrompt = useCallback(
    (value: string) => {
      updateToolSettings({ currentPrompt: value });
      rememberDraftFields({
        toolKey: "refine",
        label: "Refine",
        href: "/refine",
        fields: [intentHints, value],
      });
    },
    [intentHints, updateToolSettings],
  );
  const setIntentHints = useCallback(
    (value: string) => {
      updateToolSettings({ intentHints: value });
      rememberDraftFields({
        toolKey: "refine",
        label: "Refine",
        href: "/refine",
        fields: [value, currentPrompt],
      });
    },
    [currentPrompt, updateToolSettings],
  );
  useSeedToolDraft(mounted, {
    toolKey: "refine",
    label: "Refine",
    href: "/refine",
    fields: [intentHints, currentPrompt],
  });
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sourceHistoryId, setSourceHistoryId] = useState<string | undefined>();
  const [beforePrompt, setBeforePrompt] = useState("");
  const [handoffQueueParams, setHandoffQueueParams] = useState<
    WorkflowParamValues | undefined
  >();

  const actions = usePromptResultActions({
    tool: "refine",
    model: shared.model,
    detail: shared.detail,
    hints: intentHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const needsInpaintMask = isInpaintModel(shared.model);

  const regionalSlots =
    toolSettings.regionalSlots ?? createDefaultRegionalSlots();
  const regionalQueue = useMemo(
    () => regionalSlotsQueueExtras(regionalSlots),
    [regionalSlots],
  );

  const queueImageOptions = {
    inputImage: file,
    inputImageUrl: !file ? previewUrl ?? undefined : undefined,
    maskImage: needsInpaintMask ? maskFile : undefined,
    maskImageUrl:
      needsInpaintMask && !maskFile ? maskPreviewUrl ?? undefined : undefined,
    queueParamsBase: handoffQueueParams,
    customTokens: regionalQueue.customTokens,
    regionalSlots: regionalQueue.regionalSlots,
  };

  const assertInpaintMaskReady = useCallback(() => {
    if (!needsInpaintMask) {
      return true;
    }
    if (maskFile || maskPreviewUrl) {
      return true;
    }
    setError("Upload an inpaint mask (white = edit region) before queueing.");
    return false;
  }, [maskFile, maskPreviewUrl, needsInpaintMask]);

  const onMaskChange = useCallback(
    (nextFile: File | null, nextPreviewUrl: string | null) => {
      setMaskFile(nextFile);
      setMaskPreviewUrl((current) => {
        if (current && current !== nextPreviewUrl) {
          URL.revokeObjectURL(current);
        }
        return nextPreviewUrl;
      });
    },
    [],
  );

  const clearMaskState = useCallback(() => {
    setMaskFile(null);
    setMaskPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      improveIntent?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: GalleryHandoffPayload;
    }) => {
      setCurrentPrompt(handoff.prompt);
      setBeforePrompt(handoff.prompt);
      setSourceHistoryId(handoff.payload.historyId ?? resolveParentHistoryId());
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.improveIntent) {
        setIntentHints(handoff.improveIntent);
      }
      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      if (handoff.model) {
        updateShared({
          model: handoff.model as ComfyImageModel,
          ...sharedPatch,
        });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
      clearMaskState();
    },
    [clearMaskState, updateShared],
  );

  useGalleryHandoff("refine", applyGalleryHandoff);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
      clearMaskState();
    },
    [clearMaskState, previewUrl],
  );

  const resolveRefineImageFile = useCallback(async (): Promise<File> => {
    if (file) {
      return file;
    }
    if (!previewUrl) {
      throw new Error("Upload a reference image first.");
    }
    const response = await fetch(previewUrl);
    if (!response.ok) {
      throw new Error(`Could not load reference image (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    return new File([blob], `refine-source-${Date.now()}.png`, {
      type: blob.type || "image/png",
    });
  }, [file, previewUrl]);

  const refine = useCallback(async () => {
    if (!file && !previewUrl) {
      setError("Upload a reference image first.");
      return;
    }
    if (!intentHints.trim() && !currentPrompt.trim()) {
      setError("Enter intent hints or a current prompt to refine against.");
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const refineFile = await resolveRefineImageFile();
      const formData = new FormData();
      formData.append("image", refineFile);
      formData.append("model", shared.model);
      formData.append("detail", shared.detail);
      if (currentPrompt.trim()) {
        formData.append("currentPrompt", currentPrompt.trim());
      }
      if (intentHints.trim()) {
        formData.append("intentHints", intentHints.trim());
      }

      const response = await fetch("/api/refine", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as { prompt?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Refine failed.");
      }

      const prompt = await actions.finalizePrompt(
        data.prompt ?? "",
        intentHints.trim() || currentPrompt.trim(),
      );
      setBeforePrompt(currentPrompt.trim() || beforePrompt);
      setOutput(prompt);
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Refine failed.");
    } finally {
      setLoading(false);
    }
  }, [actions, beforePrompt, currentPrompt, intentHints, previewUrl, resolveRefineImageFile, shared]);

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

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Refine · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Prompt Refine"
      description={
        <>
          Upload a reference image and refine an existing prompt (or write one from
          scratch) against your intent — ideal for edit workflows and fixing vision
          captions.
        </>
      }
      sidebar={
        <SharedToolControls
          toolId="refine"
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || currentPrompt || intentHints}
          onSharedSettingsChange={updateShared}
        />
      }
    >
      <ToolSection>
        <FieldLabel>Reference image</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-fuchsia-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-fuchsia-500"
        />
        {previewUrl && !needsInpaintMask ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Reference preview"
            className="max-h-64 rounded-xl border border-zinc-800 object-contain"
          />
        ) : null}

        {needsInpaintMask && previewUrl ? (
          <InpaintMaskEditor
            key={previewUrl}
            sourceImageUrl={previewUrl}
            onMaskChange={onMaskChange}
          />
        ) : needsInpaintMask ? (
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-100/85">
            Upload a reference image first, then draw or upload an inpaint mask.
          </p>
        ) : null}

        <RegionalEditPanel
          slots={regionalSlots}
          onSlotsChange={(next) => updateToolSettings({ regionalSlots: next })}
          sourceImageUrl={previewUrl}
          accentClassName={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Current prompt (optional)</FieldLabel>
        <TextArea
          rows={4}
          value={currentPrompt}
          onChange={(event) => setCurrentPrompt(event.target.value)}
          placeholder="Paste the prompt you want corrected…"
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        <FieldLabel>Intent hints</FieldLabel>
        <TextArea
          rows={3}
          value={intentHints}
          onChange={(event) => setIntentHints(event.target.value)}
          placeholder="What you wanted: gravel cyclists with helmets, muddy doubletrack, no street clothes…"
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void refine()}
          disabled={!file && !previewUrl}
          loading={loading}
          loadingLabel="Refining prompt"
        >
          Refine prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {output && beforePrompt && beforePrompt !== output ? (
        <ToolSection title="Refine diff">
          <div className="grid gap-4 lg:grid-cols-2">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
              {beforePrompt}
            </pre>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-emerald-300">
              {output}
            </pre>
          </div>
          {diffPromptWords(beforePrompt, output).segments
            .filter((segment) => segment.type === "add")
            .slice(0, 12)
            .map((segment) => segment.text)
            .join(", ") ? (
            <p className="text-xs text-zinc-500">
              Added/changed:{" "}
              {diffPromptWords(beforePrompt, output).segments
                .filter((segment) => segment.type === "add")
                .slice(0, 12)
                .map((segment) => segment.text)
                .join(", ")}
            </p>
          ) : null}
        </ToolSection>
      ) : null}

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
            hints: intentHints || currentPrompt,
            parentHistoryId: sourceHistoryId,
          })
        }
        onSendComfyUi={() => {
          if (!assertInpaintMaskReady()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, intentHints)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertInpaintMaskReady()) {
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
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue refine"
        status={actions.comfyUiStatus}
        onQueue={() => {
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
      />
    </ToolLayout>
  );
}
