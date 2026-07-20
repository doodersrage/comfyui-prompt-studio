"use client";

import { useCallback, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import PromptDiagnosticsPanel from "@/components/PromptDiagnosticsPanel";
import SharedToolControls from "@/components/SharedToolControls";
import SidecarImportButton from "@/components/SidecarImportButton";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { getDetailLimits } from "@/lib/detail-level";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { DEFAULT_FORMAT_TOOL_CACHE } from "@/lib/settings-cache";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldLabel, TextArea } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";
import PromptWeightInspector from "@/components/PromptWeightInspector";

const ACCENT = "amber" as const;

export default function LintTool() {
  const { mounted, shared, updateShared } = useCachedSettings(
    "format",
    DEFAULT_FORMAT_TOOL_CACHE,
  );
  const [hints, setHints] = useState("");
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const reformatTarget = getReformatTargetModel(shared.model);
  const actions = usePromptResultActions({
    tool: "lint",
    model: shared.model,
    detail: shared.detail,
    hints,
    autoFixRules: true,
    reformatTarget,
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);

  const runLint = useCallback(async () => {
    await actions.lintPrompt(prompt, hints);
  }, [actions, prompt, hints]);

  const copyOutput = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [prompt]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Lint playground · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Prompt Lint & Fix"
      description={
        <>
          Paste hints and a finished prompt to run sport/duo/helmet diagnostics,
          apply rule fixes, compact to model limits, or copy a prompt pair — without
          generating a new scene.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={prompt || hints}
        />
      }
    >
      <ToolSection>
        <FieldLabel>Hints</FieldLabel>
        <TextArea
          value={hints}
          onChange={(event) => setHints(event.target.value)}
          placeholder="two female gravel cyclists in fierce competition"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Prompt</FieldLabel>
        <TextArea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Paste generated or hand-written prompt to lint…"
          rows={8}
          className={`font-mono text-emerald-300 ${accentFocusClass(ACCENT)}`}
        />

        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            onClick={() => void runLint()}
            disabled={!mounted || !prompt.trim()}
          >
            Run lint
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void actions.fixPrompt(prompt, setPrompt, hints)}
            disabled={!prompt.trim()}
            className="rounded-xl border border-amber-700/60 px-5 py-2 text-sm font-medium text-amber-200 disabled:opacity-50"
          >
            Fix prompt (rules)
          </button>
          <SidecarImportButton
            onImport={(sidecar) => {
              setPrompt(sidecar.positive);
              if (sidecar.hints) {
                setHints(sidecar.hints);
              }
              setImportStatus(
                `Imported sidecar · ${sidecar.tool ?? "unknown tool"} · ${sidecar.model}`,
              );
            }}
            onError={setImportStatus}
          />
        </div>
        {importStatus && <p className="text-xs text-zinc-500">{importStatus}</p>}

        {prompt.trim() ? (
          <PromptWeightInspector
            prompt={prompt}
            model={shared.model}
            onChange={setPrompt}
          />
        ) : null}
      </ToolSection>

      <PromptDiagnosticsPanel diagnostics={actions.diagnostics} />

      <EnhancedPromptResult
        output={prompt}
        provider={actions.diagnostics ? "rules" : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        limits={activeLimits}
        copied={copied}
        onCopy={() => void copyOutput()}
        onFixPrompt={() => void actions.fixPrompt(prompt, setPrompt, hints)}
        onCopyPair={() => void actions.copyPromptPair(prompt, actions.diagnostics?.inferred.sport ?? null)}
        onCompact={() => void actions.compactPrompt(prompt, setPrompt)}
        onReformat={() => void actions.reformatForModel(prompt, setPrompt)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(prompt, setPrompt, { queueComfyUi: true })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(prompt, { comfyNode: selectedModel.comfyNode })
        }
        onSendComfyUi={() => void actions.sendComfyUi(prompt, actions.diagnostics?.inferred.sport ?? null)}
        onEditPrompt={() => actions.editPromptOutput(prompt, null, undefined, hints)}
        {...promptResultPreviewProps(
          actions,
          prompt,
          actions.diagnostics?.inferred.sport ?? null,
        )}
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        pairCopied={actions.pairCopied}
      />
    </ToolLayout>
  );
}
