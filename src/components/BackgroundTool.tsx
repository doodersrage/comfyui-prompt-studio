"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useState } from "react";
import BackgroundPresetControls from "@/components/BackgroundPresetControls";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { presetOptionsFromBackgroundCache } from "@/lib/background-options";
import { readSceneLocationFromMetadata } from "@/lib/recent-locations";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import { DEFAULT_BACKGROUND_TOOL_CACHE } from "@/lib/settings-cache";
import type { EnrichedToolGenerateResult } from "@/lib/specialized/types";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldError } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "teal" as const;

export default function BackgroundTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("background", DEFAULT_BACKGROUND_TOOL_CACHE);
  const { getRecent, record } = useRecentLocations();
  const { getBlocklist } = useLocationBlocklist();
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const actions = usePromptResultActions({
    tool: "background",
    model: shared.model,
    detail: shared.detail,
    hints: [toolSettings.settingType, toolSettings.timeOfDay, toolSettings.mood]
      .filter(Boolean)
      .join(", "),
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          settingType: toolSettings.settingType,
          timeOfDay: toolSettings.timeOfDay,
          mood: toolSettings.mood,
          presetOptions: presetOptionsFromBackgroundCache(toolSettings),
          recentLocations: getRecent(),
          blockedLocations: getBlocklist(),
          ...avoidedTokensRequestBody(),
        }),
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed.");
      }

      record(readSceneLocationFromMetadata(data.metadata));

      const prompt = await actions.finalizePrompt(data.prompt);
      setOutput(prompt);
      setResult({ ...data, prompt });
    } catch (err) {
      setOutput("");
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [shared, toolSettings, getRecent, record, getBlocklist, actions]);

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

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Background · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Background Generator"
      description={
        <>
          Generates a detailed environment-only prompt—architecture, landscape,
          weather, materials, and light—with no people or figures. Expand
          optional presets for perspective, depth, lighting, and surface
          textures.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          lockedLocation={shared.lockedLocation}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={(value) => updateShared({ autoFixRules: value })}
        />
      }
    >
      <ToolSection>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={toolSettings.settingType ?? ""}
            onChange={(e) => updateToolSettings({ settingType: e.target.value })}
            placeholder="Quick tag: place type"
            className={`ui-input px-3 py-2 text-sm ${accentFocusClass(ACCENT)}`}
          />
          <input
            value={toolSettings.timeOfDay ?? ""}
            onChange={(e) => updateToolSettings({ timeOfDay: e.target.value })}
            placeholder="Quick tag: time / light"
            className={`ui-input px-3 py-2 text-sm ${accentFocusClass(ACCENT)}`}
          />
          <input
            value={toolSettings.mood ?? ""}
            onChange={(e) => updateToolSettings({ mood: e.target.value })}
            placeholder="Quick tag: mood"
            className={`ui-input px-3 py-2 text-sm ${accentFocusClass(ACCENT)}`}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Quick tags are optional shortcuts—background presets below offer structured control.
        </p>

        <BackgroundPresetControls
          mounted={mounted}
          settings={toolSettings}
          onChange={updateToolSettings}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          disabled={!mounted}
          loading={loading}
          loadingLabel="Generating background prompt"
        >
          Generate background prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        provider={result?.provider ?? null}
        comfyNode={result?.comfyNode}
        limits={result?.limits}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics ?? result?.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: [toolSettings.settingType, toolSettings.mood]
              .filter(Boolean)
              .join(", "),
            metadata: result?.metadata,
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput)}
        onCopyPair={() => void actions.copyPromptPair(output)}
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
