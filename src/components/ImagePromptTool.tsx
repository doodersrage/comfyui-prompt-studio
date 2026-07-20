"use client";

import { useCallback, useState } from "react";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useGalleryHandoff } from "@/hooks/useGalleryHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { ComfyImageModel } from "@/lib/comfy-models";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { DEFAULT_IMAGE_PROMPT_TOOL_CACHE } from "@/lib/settings-cache";
import type { EnrichedToolGenerateResult, ImagePromptFocus, ToolGenerateResult } from "@/lib/specialized/types";
import {
  IMAGE_PROMPT_DESCRIPTION_PRESETS,
  getImagePromptPreset,
  type ImagePromptDescriptionPreset,
} from "@/lib/image-prompt-presets";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldDivider, FieldError, FieldLabel, TextArea, ChipButton } from "@/components/ui/Field";
import {
  DESCRIPTION_FOCUS_LABEL,
  DESCRIPTION_PRESET_LABEL,
  EXTRA_HINTS_LABEL,
} from "@/lib/tool-ui-labels";
import { Button, PrimaryButton } from "@/components/ui/Button";

const ACCENT = "fuchsia" as const;

type RefImageUpload = {
  id: string;
  file: File;
  previewUrl: string;
  role: string;
  strength: number;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export default function ImagePromptTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("imagePrompt", DEFAULT_IMAGE_PROMPT_TOOL_CACHE);
  const [refImages, setRefImages] = useState<RefImageUpload[]>([]);
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<
    (ToolGenerateResult & { diagnostics?: EnrichedToolGenerateResult["diagnostics"] }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refineIntent, setRefineIntent] = useState("");

  const actions = usePromptResultActions({
    tool: "imagePrompt",
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.extraHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const inferredSport = result?.diagnostics?.inferred.sport ?? null;

  const selectedPreset = getImagePromptPreset(
    toolSettings.descriptionPreset ?? "standard",
  );

  const addRefImage = useCallback((nextFile: File, role = "", replace = false) => {
    setRefImages((previous) => {
      if (!replace && previous.length >= 4) {
        return previous;
      }
      const entry: RefImageUpload = {
        id: `${Date.now()}-${nextFile.name}`,
        file: nextFile,
        previewUrl: URL.createObjectURL(nextFile),
        role: role || (replace ? "primary" : `reference ${previous.length + 1}`),
        strength: replace || previous.length === 0 ? 1 : 0.75,
      };
      if (replace) {
        for (const image of previous) {
          URL.revokeObjectURL(image.previewUrl);
        }
        return [entry];
      }
      return [...previous, entry];
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      file: File | null;
      previewUrl: string | null;
    }) => {
      updateToolSettings({
        extraHints: `Reference prompt from gallery:\n${handoff.prompt.slice(0, 1200)}`,
      });
      if (handoff.model) {
        updateShared({ model: handoff.model as ComfyImageModel });
      }
      if (handoff.file) {
        addRefImage(handoff.file, "gallery reference");
      }
    },
    [addRefImage, updateShared, updateToolSettings],
  );

  useGalleryHandoff("imagePrompt", applyGalleryHandoff);

  const removeRefImage = useCallback((id: string) => {
    setRefImages((previous) => {
      const target = previous.find((entry) => entry.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter((entry) => entry.id !== id);
    });
  }, []);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      if (!nextFile) {
        setRefImages((previous) => {
          for (const entry of previous) {
            URL.revokeObjectURL(entry.previewUrl);
          }
          return [];
        });
        return;
      }
      addRefImage(nextFile, "primary", true);
    },
    [addRefImage],
  );

  const generate = useCallback(async () => {
    if (refImages.length === 0) {
      setError("Upload at least one image.");
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      let data: ToolGenerateResult & { error?: string };

      if (refImages.length === 1) {
        const formData = new FormData();
        formData.append("image", refImages[0].file);
        formData.append("model", shared.model);
        formData.append("detail", shared.detail);
        formData.append("focus", toolSettings.focus ?? "full");
        formData.append(
          "descriptionPreset",
          toolSettings.descriptionPreset ?? "standard",
        );
        if (toolSettings.extraHints?.trim()) {
          formData.append("extraHints", toolSettings.extraHints.trim());
        }

        const response = await fetch("/api/image-prompt", {
          method: "POST",
          body: formData,
        });
        data = (await response.json()) as ToolGenerateResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Generation failed.");
        }
      } else {
        const images = await Promise.all(
          refImages.map(async (entry) => ({
            image: await fileToDataUrl(entry.file),
            mimeType: entry.file.type || "image/jpeg",
            role: entry.role,
            focus: toolSettings.focus ?? "full",
            strength: entry.strength,
          })),
        );
        const response = await fetch("/api/image-prompt/multi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images,
            model: shared.model,
            detail: shared.detail,
            descriptionPreset: toolSettings.descriptionPreset ?? "standard",
            extraHints: toolSettings.extraHints?.trim() || undefined,
          }),
        });
        data = (await response.json()) as ToolGenerateResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Generation failed.");
        }
      }

      const prompt = await actions.finalizePrompt(data.prompt, toolSettings.extraHints);
      setOutput(prompt);
      setResult({ ...data, prompt });
    } catch (err) {
      setOutput("");
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [refImages, shared, toolSettings, actions]);

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

  const refine = useCallback(async () => {
    const primary = refImages[0];
    if (!primary || !refineIntent.trim()) {
      setError("Upload an image and describe what you wanted.");
      return;
    }

    setLoading(true);
    setError(null);
    actions.resetStatuses();

    try {
      const formData = new FormData();
      formData.append("image", primary.file);
      formData.append("model", shared.model);
      formData.append("detail", shared.detail);
      formData.append("currentPrompt", output);
      formData.append("intentHints", refineIntent.trim());

      const response = await fetch("/api/refine", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Refine failed.");
      }

      const prompt = await actions.finalizePrompt(data.prompt, refineIntent);
      setOutput(prompt);
      setResult({ ...data, prompt, diagnostics: data.diagnostics ?? actions.diagnostics ?? undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed.");
    } finally {
      setLoading(false);
    }
  }, [refImages, refineIntent, output, shared, actions]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Vision · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Image → Prompt"
      description={
        <>
          Upload a reference image and convert it into a model-ready prompt using
          a vision-capable LLM (`LLM_VISION_MODEL`). Standard mode now asks for pose,
          facing, limb positions, and frame placement by default.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={(value) => updateShared({ autoFixRules: value })}
          recommendFromText={output}
        />
      }
    >
      <ToolSection>
        <FieldLabel>Upload images (up to 4)</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-fuchsia-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {refImages.length > 0 && refImages.length < 4 ? (
          <label className="mt-2 block text-sm text-zinc-400">
            Add another reference
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) {
                  addRefImage(next);
                }
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
        {refImages.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {refImages.map((entry) => (
              <li key={entry.id} className="ui-surface-inset space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    value={entry.role}
                    onChange={(event) =>
                      setRefImages((previous) =>
                        previous.map((item) =>
                          item.id === entry.id
                            ? { ...item, role: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="ui-input min-w-0 flex-1 px-[var(--input-padding-x)] py-1 type-caption"
                    placeholder="Reference role"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeRefImage(entry.id)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1">
                  <span className="type-caption text-zinc-400">Strength</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(entry.strength * 100)}
                    onChange={(event) =>
                      setRefImages((previous) =>
                        previous.map((item) =>
                          item.id === entry.id
                            ? { ...item, strength: Number(event.target.value) / 100 }
                            : item,
                        ),
                      )
                    }
                    aria-label={`Strength for ${entry.role}`}
                    className="h-8 w-full min-w-0 cursor-pointer accent-fuchsia-500"
                  />
                  <span className="text-right text-xs tabular-nums text-zinc-300">
                    {Math.round(entry.strength * 100)}%
                  </span>
                </div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.previewUrl}
                  alt={entry.role}
                  className="max-h-48 rounded-lg border border-zinc-800 object-contain"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <FieldDivider />

        <FieldLabel hint="Choose how much emphasis the vision model puts on different visible details.">
          {DESCRIPTION_PRESET_LABEL}
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          {IMAGE_PROMPT_DESCRIPTION_PRESETS.map((preset) => (
            <ChipButton
              key={preset.id}
              active={(toolSettings.descriptionPreset ?? "standard") === preset.id}
              onClick={() =>
                updateToolSettings({
                  descriptionPreset: preset.id as ImagePromptDescriptionPreset,
                })
              }
            >
              {preset.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption">{selectedPreset.summary}</p>
        {selectedPreset.suggestedDetail &&
        selectedPreset.suggestedDetail !== shared.detail ? (
          <p className="type-caption text-fuchsia-300/90">
            Works best with{" "}
            <strong className="font-medium capitalize">{selectedPreset.suggestedDetail}</strong>{" "}
            detail in the sidebar.
          </p>
        ) : null}

        <FieldDivider />

        <FieldLabel>{DESCRIPTION_FOCUS_LABEL}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: "Full image", value: "full" },
              { label: "Subject", value: "subject" },
              { label: "Background", value: "background" },
              { label: "Style", value: "style" },
            ] as const
          ).map((option) => (
            <ChipButton
              key={option.value}
              active={(toolSettings.focus ?? "full") === option.value}
              onClick={() =>
                updateToolSettings({ focus: option.value as ImagePromptFocus })
              }
            >
              {option.label}
            </ChipButton>
          ))}
        </div>

        <FieldDivider />

        <FieldLabel>{EXTRA_HINTS_LABEL}</FieldLabel>
        <TextArea
          value={toolSettings.extraHints ?? ""}
          onChange={(e) => updateToolSettings({ extraHints: e.target.value })}
          placeholder="e.g. two cyclists side by side, gravel bikes, helmets on"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          disabled={!mounted || refImages.length === 0}
          loading={loading}
          loadingLabel="Analyzing image"
        >
          Generate prompt from image
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {output && (
        <ToolSection title="Refine against intent">
          <TextArea
            rows={2}
            value={refineIntent}
            onChange={(event) => setRefineIntent(event.target.value)}
            placeholder="What you wanted: two gravel cyclists with helmets, not street clothes…"
            className={accentFocusClass(ACCENT)}
          />
          <Button
            variant="accent-outline"
            loading={loading}
            loadingLabel="Refining prompt from image"
            disabled={refImages.length === 0}
            onClick={() => void refine()}
          >
            Refine prompt from image
          </Button>
        </ToolSection>
      )}

      <EnhancedPromptResult
        output={output}
        provider={result?.provider ?? null}
        comfyNode={result?.comfyNode}
        limits={result?.limits}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        readinessHints={toolSettings.extraHints}
        copied={copied}
        onCopy={() => void copyOutput()}
        extraMeta={
          typeof result?.metadata?.qualityWarning === "string"
            ? `shorter than ideal: ${result.metadata.qualityWarning}`
            : undefined
        }
        diagnostics={actions.diagnostics ?? result?.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: toolSettings.extraHints,
            metadata: result?.metadata,
          })
        }
        onOutputChange={setOutput}
        onSendComfyUi={() => void actions.sendComfyUi(output, inferredSport)}
        showWeightInspector={Boolean(output)}
        {...promptResultPreviewProps(actions, output, inferredSport)}
        onFixPrompt={() =>
          void actions.fixPrompt(output, setOutput, toolSettings.extraHints)
        }
        onCopyPair={() => void actions.copyPromptPair(output, inferredSport)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, setOutput, {
            maxChars: result?.limits?.maxChars,
            queueComfyUi: true,
          })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(output, {
            comfyNode: result?.comfyNode ?? selectedModel.comfyNode,
            metadata: result?.metadata,
          })
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
