"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useEffect, useState } from "react";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { ComfyImageModel } from "@/lib/comfy-models";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { diffPromptWords } from "@/lib/prompt-diff";
import { resolveParentHistoryId } from "@/lib/prompt-lineage-session";
import { DEFAULT_IMAGE_PROMPT_TOOL_CACHE } from "@/lib/settings-cache";
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
    useCachedSettings("imagePrompt", DEFAULT_IMAGE_PROMPT_TOOL_CACHE);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [intentHints, setIntentHints] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sourceHistoryId, setSourceHistoryId] = useState<string | undefined>();
  const [beforePrompt, setBeforePrompt] = useState("");

  const actions = usePromptResultActions({
    tool: "refine",
    model: shared.model,
    detail: shared.detail,
    hints: intentHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      improveIntent?: string;
      file: File | null;
      previewUrl: string | null;
      payload: { historyId?: string };
    }) => {
      setCurrentPrompt(handoff.prompt);
      setBeforePrompt(handoff.prompt);
      setSourceHistoryId(handoff.payload.historyId ?? resolveParentHistoryId());
      if (handoff.improveIntent) {
        setIntentHints(handoff.improveIntent);
      }
      if (handoff.model) {
        updateShared({ model: handoff.model as ComfyImageModel });
      }
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
    },
    [updateShared],
  );

  useGalleryHandoff("refine", applyGalleryHandoff);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
    },
    [previewUrl],
  );

  const refine = useCallback(async () => {
    if (!file) {
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
      const formData = new FormData();
      formData.append("image", file);
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
  }, [file, currentPrompt, intentHints, shared, actions]);

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
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || currentPrompt || intentHints}
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
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Reference preview"
            className="max-h-64 rounded-xl border border-zinc-800 object-contain"
          />
        )}

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
          disabled={!file}
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
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, intentHints)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, setOutput, { queueComfyUi: true })
        }
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
