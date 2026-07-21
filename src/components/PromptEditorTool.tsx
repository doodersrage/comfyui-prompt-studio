"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import PromptDiagnosticsPanel from "@/components/PromptDiagnosticsPanel";
import SharedToolControls from "@/components/SharedToolControls";
import SidecarImportButton from "@/components/SidecarImportButton";
import PromptWeightInspector from "@/components/PromptWeightInspector";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { usePromptEditorHandoff, type PromptEditorHandoffMeta } from "@/hooks/usePromptEditorHandoff";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import { getDetailLimits } from "@/lib/detail-level";
import { modelUsesNegativePrompt } from "@/lib/prompt-pair";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { rememberDraftFields } from "@/lib/remember-draft-fields";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { DEFAULT_PROMPT_EDITOR_TOOL_CACHE } from "@/lib/settings-cache";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { FieldLabel, TextArea } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "sky" as const;

export default function PromptEditorTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("promptEditor", DEFAULT_PROMPT_EDITOR_TOOL_CACHE);
  const hints = toolSettings.hints ?? "";
  const positive = toolSettings.positive ?? "";
  const negative = toolSettings.negative ?? "";
  const [copied, setCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [negativeStatus, setNegativeStatus] = useState<string | null>(null);
  const [sourceMeta, setSourceMeta] = useState<PromptEditorHandoffMeta | null>(null);

  const rememberEditorDraft = useCallback(
    (next: { hints?: string; positive?: string; negative?: string }) => {
      rememberDraftFields({
        toolKey: "prompt-editor",
        label: "Prompt Editor",
        href: "/prompt",
        fields: [
          next.positive ?? positive,
          next.hints ?? hints,
          next.negative ?? negative,
        ],
      });
    },
    [hints, negative, positive],
  );

  const setHints = useCallback(
    (value: string) => {
      updateToolSettings({ hints: value });
      rememberEditorDraft({ hints: value });
    },
    [rememberEditorDraft, updateToolSettings],
  );
  const setPositive = useCallback(
    (value: string) => {
      updateToolSettings({ positive: value });
      rememberEditorDraft({ positive: value });
    },
    [rememberEditorDraft, updateToolSettings],
  );
  const setNegative = useCallback(
    (value: string) => {
      updateToolSettings({ negative: value });
      rememberEditorDraft({ negative: value });
    },
    [rememberEditorDraft, updateToolSettings],
  );

  useSeedToolDraft(mounted, {
    toolKey: "prompt-editor",
    label: "Prompt Editor",
    href: "/prompt",
    fields: [positive, hints, negative],
  });

  const reformatTarget = getReformatTargetModel(shared.model);
  const actions = usePromptResultActions({
    tool: "prompt-editor",
    model: shared.model,
    detail: shared.detail,
    hints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget,
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);
  const usesNegative = modelUsesNegativePrompt(shared.model);
  const sport = actions.diagnostics?.inferred.sport ?? null;

  usePromptEditorHandoff(
    useCallback(
      (payload) => {
        setPositive(payload.positive);
        setNegative(payload.negative);
        if (payload.hints) {
          setHints(payload.hints);
        }
        if (payload.model) {
          updateShared({ model: payload.model as typeof shared.model });
        }
        setSourceMeta(payload.meta);
        actions.resetStatuses();
      },
      [actions, setHints, setNegative, setPositive, updateShared],
    ),
  );

  const runLint = useCallback(async () => {
    await actions.lintPrompt(positive, hints);
  }, [actions, positive, hints]);

  const copyPositive = useCallback(async () => {
    if (!positive) {
      return;
    }
    try {
      await navigator.clipboard.writeText(positive);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [positive]);

  const generateNegative = useCallback(async () => {
    setNegativeStatus("Building negative…");
    try {
      const response = await fetch("/api/negative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hints: hints || positive.slice(0, 240),
          sport: sport ?? undefined,
        }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Negative generation failed.");
      }
      setNegative(data.prompt ?? "");
      setNegativeStatus("Negative prompt generated.");
    } catch (err) {
      setNegativeStatus(err instanceof Error ? err.message : "Negative generation failed.");
    }
  }, [hints, positive, setNegative, sport]);

  const queueOptions = { explicitNegative: negative.trim() || undefined };

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Manual edit · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Prompt Editor"
      description={
        <>
          Edit positive and negative prompts by hand, run lint and optimization,
          then copy a pair or send to ComfyUI. Open from gallery or history to
          tweak an existing generation.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={positive || hints}
        />
      }
    >
      {sourceMeta ? (
        <ToolSection>
          <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-sky-800/35 bg-gradient-to-br from-sky-950/30 to-zinc-950/40 p-4 shadow-[inset_0_1px_0_rgba(125,211,252,0.06)]">
            {sourceMeta.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceMeta.imageUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl border border-zinc-800/80 object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-sky-100">
                Loaded from {sourceMeta.source === "gallery" ? "gallery" : "history"}
                {sourceMeta.tool ? ` · ${sourceMeta.tool}` : ""}
              </p>
              <p className="text-xs text-zinc-500">
                Edits here do not change the saved gallery entry until you queue a new job.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                {sourceMeta.source === "gallery" ? (
                  <Link
                    href="/gallery"
                    className="text-xs text-sky-300 transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                  >
                    Back to gallery
                  </Link>
                ) : null}
                {sourceMeta.historyId ? (
                  <Link
                    href={`/studio?history=${sourceMeta.historyId}`}
                    className="text-xs text-sky-300 transition hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                  >
                    Open in Studio
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </ToolSection>
      ) : null}

      <ToolSection>
        <FieldLabel>Hints</FieldLabel>
        <TextArea
          value={hints}
          onChange={(event) => setHints(event.target.value)}
          placeholder="Optional scene hints for lint, negative generation, and queue steering"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Positive prompt</FieldLabel>
        <TextArea
          value={positive}
          onChange={(event) => setPositive(event.target.value)}
          placeholder="Paste or type your positive prompt…"
          rows={10}
          className={`font-mono text-emerald-300 ${accentFocusClass(ACCENT)}`}
        />

        {usesNegative ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <FieldLabel>Negative prompt</FieldLabel>
              <button
                type="button"
                onClick={() => void generateNegative()}
                disabled={!positive.trim() && !hints.trim()}
                className="rounded-lg border border-sky-700/50 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:border-sky-600/70 hover:bg-sky-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 disabled:opacity-50"
              >
                Auto-generate negative
              </button>
            </div>
            <TextArea
              value={negative}
              onChange={(event) => setNegative(event.target.value)}
              placeholder="Optional — leave blank to auto-resolve on queue"
              rows={4}
              className={`font-mono text-rose-200/90 ${accentFocusClass(ACCENT)}`}
            />
            {negativeStatus ? (
              <p className="text-xs text-zinc-500">{negativeStatus}</p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-zinc-500">
            {selectedModel.comfyNode} ignores separate negatives — fold exclusions into the positive prompt.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            onClick={() => void runLint()}
            disabled={!mounted || !positive.trim()}
          >
            Run lint
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void actions.fixPrompt(positive, setPositive, hints)}
            disabled={!positive.trim()}
            className="rounded-xl border border-sky-700/60 px-5 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-600/70 hover:bg-sky-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 disabled:opacity-50"
          >
            Fix prompt (rules)
          </button>
          <SidecarImportButton
            onImport={(sidecar) => {
              setPositive(sidecar.positive);
              if (sidecar.negative) {
                setNegative(sidecar.negative);
              }
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
        {importStatus ? <p className="text-xs text-zinc-500">{importStatus}</p> : null}

        {positive.trim() ? (
          <PromptWeightInspector
            prompt={positive}
            model={shared.model}
            onChange={setPositive}
          />
        ) : null}
      </ToolSection>

      <PromptDiagnosticsPanel diagnostics={actions.diagnostics} />

      <EnhancedPromptResult
        output={positive}
        provider={actions.diagnostics ? "rules" : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        limits={activeLimits}
        copied={copied}
        onCopy={() => void copyPositive()}
        onFixPrompt={() => void actions.fixPrompt(positive, setPositive, hints)}
        onCopyPair={() =>
          void actions.copyPromptPair(positive, sport, queueOptions.explicitNegative)
        }
        onCompact={() => void actions.compactPrompt(positive, setPositive)}
        onReformat={() => void actions.reformatForModel(positive, setPositive)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(positive, setPositive, { queueComfyUi: true })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(positive, { comfyNode: selectedModel.comfyNode })
        }
        onSendComfyUi={() =>
          void actions.sendComfyUi(positive, sport, undefined, queueOptions)
        }
        {...promptResultPreviewProps(actions, positive, sport)}
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
