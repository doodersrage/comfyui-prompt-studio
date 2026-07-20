"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModelSelector from "@/components/ModelSelector";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import type { DetailLevel } from "@/lib/detail-level";
import { getDetailLimits } from "@/lib/detail-level";
import {
  getComfyModelDefinition,
  type ComfyImageModel,
} from "@/lib/comfy-models";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from "@/components/ui/ToolPageShell";
import { FieldDivider, FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";
import { DEFAULT_FORMAT_TOOL_CACHE } from "@/lib/settings-cache";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

const ACCENT = "emerald" as const;

type FormatMode = "positive" | "negative";

type FormatResponse = {
  prompt: string;
  mode: FormatMode;
  model: ComfyImageModel;
  comfyNode: string;
  provider: "llm" | "rules";
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  inputChars: number;
  outputChars: number;
};

const EXAMPLE_DRAFTS = [
  "1girl, neon alley, rain, masterpiece, best quality, 8k",
  "keep her face, change background to gothic cathedral with candles and fog",
  "A woman in a red dress standing in a field at sunset",
];

export default function PromptFormatter() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("format", DEFAULT_FORMAT_TOOL_CACHE);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<FormatMode>(
    DEFAULT_FORMAT_TOOL_CACHE.mode ?? "positive",
  );
  const [output, setOutput] = useState("");
  const [provider, setProvider] = useState<"llm" | "rules" | null>(null);
  const [resultMeta, setResultMeta] = useState<Omit<
    FormatResponse,
    "prompt" | "provider"
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const targetModel = shared.model;
  const detail = shared.detail;
  const smartFormat = toolSettings.smartFormat ?? true;
  const autoFixRules = shared.autoFixRules !== false;

  const actions = usePromptResultActions({
    tool: "format",
    model: targetModel,
    detail,
    hints: input,
    autoFixRules,
    reformatTarget: getReformatTargetModel(targetModel),
  });

  const setTargetModel = (model: ComfyImageModel) => updateShared({ model });
  const setDetail = (value: DetailLevel) => updateShared({ detail: value });
  const setSmartFormat = (value: boolean) =>
    updateToolSettings({ smartFormat: value });
  const setModeAndCache = (value: FormatMode) => {
    setMode(value);
    updateToolSettings({ mode: value });
  };

  const selectedModel = useMemo(
    () => getComfyModelDefinition(targetModel),
    [targetModel],
  );

  const activeLimits = useMemo(
    () => getDetailLimits(detail, targetModel),
    [detail, targetModel],
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (toolSettings.mode) {
        setMode(toolSettings.mode);
      }
    });
  }, [toolSettings.mode]);

  const submitDisabled = !mounted || loading || !input.trim();

  const runFormat = useCallback(async () => {
    if (!input.trim()) {
      setError("Paste a prompt draft first.");
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      if (mode === "positive") {
        await actions.runPreLint(input);
      }

      const response = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          mode,
          detail,
          model: targetModel,
          smartFormat,
        }),
      });

      const data = (await response.json()) as FormatResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Formatting failed.");
      }

      const prompt =
        mode === "positive"
          ? await actions.finalizePrompt(data.prompt, input)
          : data.prompt;
      setOutput(prompt);
      setProvider(data.provider);
      setResultMeta({
        mode: data.mode,
        model: data.model,
        comfyNode: data.comfyNode,
        limits: data.limits,
        inputChars: data.inputChars,
        outputChars: data.outputChars,
      });
    } catch (err) {
      setOutput("");
      setProvider(null);
      setResultMeta(null);
      setError(err instanceof Error ? err.message : "Formatting failed.");
    } finally {
      setLoading(false);
    }
  }, [input, mode, detail, targetModel, smartFormat, actions]);

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
      badge={<ToolBadge accent={ACCENT}>Prompt formatter</ToolBadge>}
      title="Format for your model"
      description={
        <>
          Paste an existing prompt—tag soup, a rough sentence, or a draft from
          another model. This tool restructures and trims it for{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-emerald-300">
            {selectedModel.comfyNode}
          </code>
          .
        </>
      }
      sidebarTitle="Format settings"
      sidebarDescription="Model, detail, and formatting options."
      sidebar={
        <>
          <div className="space-y-4">
            <FieldLabel hint="Prompt style and size limits depend on the model and detail level you choose.">
              Target model
            </FieldLabel>
            <ModelSelector value={targetModel} onChange={setTargetModel} />
          </div>

          <FieldDivider />

          <div className="space-y-3">
            <FieldLabel hint="Controls length limits for the formatted output.">
              Detail level
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { label: "Concise", value: "concise" },
                  { label: "Balanced", value: "balanced" },
                  { label: "Rich", value: "rich" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setDetail(preset.value)}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                    detail === preset.value
                      ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-100"
                      : "border-zinc-700/80 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              {activeLimits.minChars
                ? `${activeLimits.minSentences}–${activeLimits.maxSentences} sentences, ${activeLimits.minChars}–${activeLimits.maxChars} chars`
                : `Up to ${activeLimits.maxSentences} sentences, ~${activeLimits.maxChars} chars`}
            </p>
          </div>

          <FieldDivider />

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={smartFormat}
              onChange={(e) => setSmartFormat(e.target.checked)}
              className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentRingClass(ACCENT)}`}
            />
            <span className="space-y-1">
              <span className="text-sm font-medium text-zinc-100">
                Smart format (LLM)
              </span>
              <span className="block text-xs leading-relaxed text-zinc-500">
                Rewrites your draft for the target model while preserving content.
                Off uses instant rules-only cleanup.
              </span>
            </span>
          </label>

          {mode === "positive" && (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={autoFixRules}
                onChange={(e) =>
                  updateShared({ autoFixRules: e.target.checked })
                }
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentRingClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="text-sm font-medium text-zinc-100">
                  Auto-fix lint errors
                </span>
                <span className="block text-xs leading-relaxed text-zinc-500">
                  Apply rule-based fixes when lint reports errors after formatting.
                </span>
              </span>
            </label>
          )}
        </>
      }
    >
      <ToolSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FieldLabel htmlFor="format-input" hint="Tags, rough prose, or a draft from another tool.">
            Prompt draft
          </FieldLabel>
          <div className="flex rounded-xl border border-zinc-700/80 p-0.5">
            <button
              type="button"
              onClick={() => setModeAndCache("positive")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                mode === "positive"
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Positive
            </button>
            <button
              type="button"
              onClick={() => setModeAndCache("negative")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                mode === "negative"
                  ? "bg-rose-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Negative / Preserve
            </button>
          </div>
        </div>

        <TextArea
          id="format-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void runFormat();
            }
          }}
          placeholder="Paste your prompt here—tags, rough prose, or a draft from another tool…"
          rows={7}
          className={`text-base ${accentFocusClass(ACCENT)}`}
        />

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_DRAFTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setInput(example)}
              className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
            >
              {example.length > 48 ? `${example.slice(0, 48)}…` : example}
            </button>
          ))}
        </div>

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void runFormat()}
          disabled={!mounted || !input.trim()}
          loading={loading}
          loadingLabel="Formatting prompt"
        >
          Format prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {output && mode === "positive" && (
        <EnhancedPromptResult
          output={output}
          provider={provider}
          comfyNode={resultMeta?.comfyNode ?? selectedModel.comfyNode}
          limits={resultMeta?.limits}
          readinessModel={shared.model}
          readinessDetail={shared.detail}
          copied={copied}
          onCopy={() => void copyOutput()}
          extraMeta={
            resultMeta
              ? `${resultMeta.inputChars} → ${resultMeta.outputChars} chars`
              : undefined
          }
          diagnostics={actions.diagnostics}
          preDiagnostics={actions.preDiagnostics}
          onSaveHistory={() =>
            actions.saveHistory({ prompt: output, hints: input })
          }
          onSendComfyUi={() => void actions.sendComfyUi(output)}
          onOutputChange={setOutput}
          {...promptResultPreviewProps(actions, output)}
          onFixPrompt={() => void actions.fixPrompt(output, setOutput, input)}
          onCopyPair={() => void actions.copyPromptPair(output)}
          onCompact={() => void actions.compactPrompt(output, setOutput)}
          onReformat={() => void actions.reformatForModel(output, setOutput)}
          reformatTargetLabel={getReformatTargetLabel(targetModel)}
          onRunPipeline={() =>
            void actions.runExportPipeline(output, setOutput, {
              maxChars: resultMeta?.limits.maxChars,
              queueComfyUi: true,
            })
          }
          onExportSidecar={() =>
            void actions.exportSidecar(output, {
              comfyNode: resultMeta?.comfyNode ?? selectedModel.comfyNode,
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
      )}

      {output && mode === "negative" && (
        <ToolSection title="Formatted preserve prompt">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button onClick={() => void copyOutput()}>
              {copied ? "Copied!" : "Copy for ComfyUI"}
            </Button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-zinc-800/90 bg-zinc-950/80 p-5 font-mono text-sm leading-relaxed text-emerald-300">
            {output}
          </pre>
        </ToolSection>
      )}
    </ToolLayout>
  );
}
