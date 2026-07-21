"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import InpaintMaskEditor from "@/components/InpaintMaskEditor";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { ComfyImageModel } from "@/lib/comfy-models/client";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { buildInpaintInstruction } from "@/lib/regional-prompt-builder";
import { isInpaintModel } from "@/lib/model-denoise-defaults";
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

const ACCENT = "amber" as const;
const DEFAULT_INPAINT_MODEL: ComfyImageModel = "flux-inpaint";

export default function InpaintTool() {
  const { mounted, shared, updateShared } = useCachedSettings(
    "imagePrompt",
    DEFAULT_IMAGE_PROMPT_TOOL_CACHE,
  );
  const modelInitializedRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [handoffQueueParams, setHandoffQueueParams] = useState<
    WorkflowParamValues | undefined
  >();
  const [maskDescription, setMaskDescription] = useState("");
  const [changeDescription, setChangeDescription] = useState("");
  const [directPrompt, setDirectPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const actions = usePromptResultActions({
    tool: "inpaint",
    model: shared.model,
    detail: shared.detail,
    hints: maskDescription || changeDescription,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const needsInpaintMask = isInpaintModel(shared.model);

  const output = useMemo(() => {
    if (directPrompt.trim()) {
      return directPrompt.trim();
    }
    if (maskDescription.trim() && changeDescription.trim()) {
      return buildInpaintInstruction(maskDescription, changeDescription);
    }
    return changeDescription.trim();
  }, [changeDescription, directPrompt, maskDescription]);

  const queueImageOptions = {
    inputImage: file,
    inputImageUrl: !file ? previewUrl ?? undefined : undefined,
    maskImage: needsInpaintMask ? maskFile : undefined,
    maskImageUrl:
      needsInpaintMask && !maskFile ? maskPreviewUrl ?? undefined : undefined,
    queueParamsBase: handoffQueueParams,
  };

  useEffect(() => {
    if (!mounted || modelInitializedRef.current) {
      return;
    }
    modelInitializedRef.current = true;
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_INPAINT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const onMaskChange = useCallback((nextFile: File | null, nextPreviewUrl: string | null) => {
    setMaskFile(nextFile);
    setMaskPreviewUrl((current) => {
      if (current && current !== nextPreviewUrl) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
  }, []);

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
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
    }) => {
      setChangeDescription(handoff.prompt);
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
      clearMaskState();
    },
    [clearMaskState],
  );

  useGalleryHandoff("inpaint", (handoff) => {
    applyGalleryHandoff(handoff);
    if (handoff.model && isInpaintModel(handoff.model)) {
      updateShared({ model: handoff.model as ComfyImageModel });
    }
  });

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

  const assertReadyToQueue = useCallback(() => {
    if (!previewUrl && !file) {
      setError("Upload a source image first.");
      return false;
    }
    if (!output.trim()) {
      setError("Describe what belongs in the masked region.");
      return false;
    }
    if (needsInpaintMask && !maskFile && !maskPreviewUrl) {
      setError("Draw or upload an inpaint mask before queueing.");
      return false;
    }
    setError(null);
    return true;
  }, [file, maskFile, maskPreviewUrl, needsInpaintMask, output, previewUrl]);

  const lintAndSetDirectPrompt = useCallback(async () => {
    if (!output.trim()) {
      return;
    }
    actions.resetStatuses();
    const finalized = await actions.finalizePrompt(output, maskDescription || changeDescription);
    setDirectPrompt(finalized);
  }, [actions, changeDescription, maskDescription, output]);

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

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Inpaint · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="FLUX Inpaint"
      description={
        <>
          Upload a source image, paint the edit region, and describe what belongs inside the
          mask only. Queue uses <code>{`{{INPUT_IMAGE}}`}</code> and{" "}
          <code>{`{{MASK_IMAGE}}`}</code> when your workflow is bound.
        </>
      }
      sidebar={
        <SharedToolControls
          toolId="inpaint"
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || changeDescription || maskDescription}
        />
      }
    >
      <ToolSection>
        <FieldLabel>Source image</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        />
        {previewUrl ? (
          <InpaintMaskEditor key={previewUrl} sourceImageUrl={previewUrl} onMaskChange={onMaskChange} />
        ) : (
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-100/85">
            Upload a source image to draw or upload the inpaint mask.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel hint="Optional — helps the LLM and instruction builder.">
              Mask region (words)
            </FieldLabel>
            <TextArea
              rows={2}
              value={maskDescription}
              onChange={(event) => setMaskDescription(event.target.value)}
              placeholder="e.g. sky above the horizon, subject's jacket"
              className={accentFocusClass(ACCENT)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>What belongs in the mask</FieldLabel>
            <TextArea
              rows={2}
              value={changeDescription}
              onChange={(event) => setChangeDescription(event.target.value)}
              placeholder="e.g. dramatic storm clouds with warm edge light"
              className={accentFocusClass(ACCENT)}
            />
          </div>
        </div>

        <FieldLabel hint="Overrides the composed instruction when filled.">
          Prompt override (optional)
        </FieldLabel>
        <TextArea
          rows={3}
          value={directPrompt}
          onChange={(event) => setDirectPrompt(event.target.value)}
          placeholder="Leave empty to use the composed inpaint instruction…"
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        {output ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-300">
            {output}
          </pre>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            onClick={() => void lintAndSetDirectPrompt()}
            disabled={!output.trim()}
          >
            Lint &amp; fix prompt
          </PrimaryButton>
        </div>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        provider={output ? "template" : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: maskDescription || changeDescription,
          })
        }
        onSendComfyUi={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setDirectPrompt, maskDescription)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setDirectPrompt)}
        onReformat={() => void actions.reformatForModel(output, setDirectPrompt)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.runExportPipeline(output, setDirectPrompt, {
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
