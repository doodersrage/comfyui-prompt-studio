"use client";

import { useCallback, useState } from "react";
import { usePromptHistory } from "@/hooks/usePromptHistory";
import type { GenerationDiagnostics } from "@/lib/generation-diagnostics";
import {
  formatPromptPair,
  modelUsesNegativePrompt,
} from "@/lib/prompt-pair";
import {
  buildPromptSidecar,
  downloadPromptSidecar,
} from "@/lib/prompt-sidecar";
import type { ComfyImageModel } from "@/lib/comfy-models";
import type { DetailLevel } from "@/lib/detail-level";
import type { AthleticSport } from "@/lib/athletic-sport-profiles";
import { resolveRuntimeForQueue } from "@/lib/comfyui-runtime-for-model";
import { startImproveFromResult, startPromptEditorFromResult, startRefineFromResult } from "@/lib/improve-output";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import {
  galleryEntryPrimaryViewUrl,
} from "@/lib/comfyui-gallery";
import { scheduleComfyGalleryPoll } from "@/lib/comfyui-gallery-poller";
import { registerComfyGalleryJob } from "@/lib/comfyui-gallery-client";
import {
  attachGalleryPromptIdToHistory,
  linkGalleryToHistory,
} from "@/lib/prompt-lineage";
import { resolveQueueNegativePrompt } from "@/lib/queue-negative";
import { loadActiveProjectId } from "@/lib/prompt-projects";
import {
  clearLineageParent,
  resolveParentHistoryId,
} from "@/lib/prompt-lineage-session";
import { injectLoraTriggers } from "@/lib/lora-prompt-injection";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import { resolveQueueInputImageFilename } from "@/lib/queue-input-image";
import { resolveQueueParams } from "@/lib/queue-params-settings";
import { applyQueuePromptSteering, prepareQueuePrompts } from "@/lib/queue-prompt-prep";
import { resolveQueueNegativePromptRaw } from "@/lib/queue-negative";
import { runWorkflowPreflight } from "@/lib/workflow-preflight";
import { dispatchWebhook } from "@/lib/webhook-settings";
import { markOnboardingFirstQueue } from "@/lib/onboarding-hooks";
import {
  formatComfyUiJobStatusLine,
  type ComfyUiJobTrackerState,
} from "@/lib/comfyui-job-status";
import { fetchWorkflowPreview } from "@/lib/comfyui-requeue";

export type PromptResultActionsConfig = {
  tool: string;
  model: ComfyImageModel;
  detail?: DetailLevel;
  hints?: string;
  autoFixRules?: boolean;
  /** Target model for cross-model reformat chain. */
  reformatTarget?: ComfyImageModel;
};

export function usePromptResultActions(config: PromptResultActionsConfig) {
  const { addEntry } = usePromptHistory();
  const [preDiagnostics, setPreDiagnostics] = useState<GenerationDiagnostics | null>(
    null,
  );
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(
    null,
  );
  const [historySaved, setHistorySaved] = useState(false);
  const [fixStatus, setFixStatus] = useState<string | null>(null);
  const [comfyUiStatus, setComfyUiStatus] = useState<string | null>(null);
  const [comfyUiJob, setComfyUiJob] = useState<ComfyUiJobTrackerState | null>(null);
  const [comfyUiPreviewUrl, setComfyUiPreviewUrl] = useState<string | null>(null);
  const [pairCopied, setPairCopied] = useState(false);
  const [compactStatus, setCompactStatus] = useState<string | null>(null);
  const [reformatStatus, setReformatStatus] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<Awaited<
    ReturnType<typeof fetchWorkflowPreview>
  > | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);

  const resetStatuses = useCallback(() => {
    setHistorySaved(false);
    setFixStatus(null);
    setComfyUiStatus(null);
    setComfyUiJob(null);
    setComfyUiPreviewUrl(null);
    setPairCopied(false);
    setCompactStatus(null);
    setReformatStatus(null);
    setPipelineStatus(null);
    setWorkflowPreview(null);
    setPreviewStatus(null);
  }, []);

  const trackComfyUiJob = useCallback(
    (
      input: {
        promptId: string;
        prompt: string;
        negativePrompt?: string;
        comfyUrl: string;
        historyId?: string;
        queueParams?: WorkflowParamValues;
        queueQualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile;
      },
      showPreview = true,
    ) => {
      registerComfyGalleryJob({
        promptId: input.promptId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        tool: config.tool,
        model: config.model,
        comfyUrl: input.comfyUrl,
        historyId: input.historyId,
        queueParams: input.queueParams,
        queueQualityProfile: input.queueQualityProfile,
        projectId: loadActiveProjectId(),
      });

      if (input.historyId) {
        linkGalleryToHistory(input.promptId, input.historyId);
        attachGalleryPromptIdToHistory(
          input.historyId,
          input.promptId,
          undefined,
        );
      }

      const initialJob: ComfyUiJobTrackerState = {
        promptId: input.promptId,
        status: "pending",
        statusMessage: "Submitted to ComfyUI",
        comfyUrl: input.comfyUrl,
      };
      setComfyUiJob(initialJob);
      setComfyUiStatus(formatComfyUiJobStatusLine(initialJob));

      void scheduleComfyGalleryPoll(input.promptId, {
        comfyUrl: input.comfyUrl,
        onJobUpdate: (job) => {
          setComfyUiJob(job);
          setComfyUiStatus(formatComfyUiJobStatusLine(job));
        },
      }).then((entry) => {
        if (!entry) {
          return;
        }

        const finishedJob: ComfyUiJobTrackerState = {
          promptId: input.promptId,
          status: entry.status,
          statusMessage: entry.statusMessage,
          comfyUrl: entry.comfyUrl,
          imageCount: entry.images.length,
        };
        setComfyUiJob(finishedJob);
        setComfyUiStatus(formatComfyUiJobStatusLine(finishedJob));

        if (entry.status === "completed") {
          const preview = galleryEntryPrimaryViewUrl(entry);
          if (showPreview && preview) {
            setComfyUiPreviewUrl(preview);
          }
          return;
        }
      });
    },
    [config.model, config.tool],
  );

  const runPreLint = useCallback(async (hints?: string) => {
    const corpus = hints?.trim();
    if (!corpus) {
      setPreDiagnostics(null);
      return null;
    }

    const response = await fetch("/api/lint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hints: corpus }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GenerationDiagnostics;
    setPreDiagnostics(data);
    return data;
  }, []);

  const lintPrompt = useCallback(async (prompt: string, hints?: string) => {
    const response = await fetch("/api/lint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hints: hints ?? config.hints, prompt }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GenerationDiagnostics;
    setDiagnostics(data);
    return data;
  }, [config.hints]);

  const fetchNegative = useCallback(
    async (sport?: AthleticSport | null) => {
      return resolveQueueNegativePrompt({
        model: config.model,
        hints: config.hints,
        sport,
        tool: config.tool,
      });
    },
    [config.hints, config.model],
  );

  const applyRuleFix = useCallback(
    async (prompt: string, hints?: string) => {
      const response = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hints: hints ?? config.hints, prompt }),
      });

      const data = (await response.json()) as {
        prompt?: string;
        changes?: Array<{ description: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Fix failed.");
      }

      return data;
    },
    [config.hints],
  );

  const maybeAutoFix = useCallback(
    async (prompt: string, hints?: string, lint?: GenerationDiagnostics | null) => {
      if (config.autoFixRules === false) {
        return prompt;
      }

      const hasErrors = lint?.issues.some((issue) => issue.severity === "error");
      if (!hasErrors) {
        return prompt;
      }

      try {
        const data = await applyRuleFix(prompt, hints);
        if (data.prompt && data.prompt !== prompt) {
          setFixStatus(
            data.changes?.length
              ? `Auto-fixed: ${data.changes.map((c) => c.description).join("; ")}`
              : "Auto-fix applied.",
          );
          return data.prompt;
        }
      } catch {
        // keep original prompt
      }

      return prompt;
    },
    [applyRuleFix, config.autoFixRules],
  );

  const finalizePrompt = useCallback(
    async (prompt: string, hints?: string) => {
      const lint = await lintPrompt(prompt, hints);
      return maybeAutoFix(prompt, hints, lint);
    },
    [lintPrompt, maybeAutoFix],
  );

  const fixPrompt = useCallback(
    async (prompt: string, onFixed: (next: string) => void, hints?: string) => {
      if (!prompt) {
        return;
      }

      setFixStatus("Applying rule fixes…");
      try {
        const data = await applyRuleFix(prompt, hints);
        if (data.prompt) {
          onFixed(data.prompt);
          await lintPrompt(data.prompt, hints);
        }
        setFixStatus(
          data.changes?.length
            ? `Fixed: ${data.changes.map((change) => change.description).join("; ")}`
            : "No rule-based fixes needed.",
        );
      } catch (err) {
        setFixStatus(err instanceof Error ? err.message : "Fix failed.");
      }
    },
    [applyRuleFix, lintPrompt],
  );

  const saveHistory = useCallback(
    (input: {
      prompt: string;
      hints?: string;
      metadata?: Record<string, unknown>;
      parentHistoryId?: string;
    }): string | undefined => {
      if (!input.prompt) {
        return undefined;
      }

      const projectId = loadActiveProjectId();
      const parentHistoryId = resolveParentHistoryId(input.parentHistoryId);
      const historyId = addEntry({
        tool: config.tool,
        prompt: input.prompt,
        hints: input.hints ?? config.hints,
        model: config.model,
        diagnostics: diagnostics ?? undefined,
        metadata: {
          ...(input.metadata ?? {}),
          ...(parentHistoryId ? { parentHistoryId } : {}),
          ...(projectId ? { projectId } : {}),
        },
      });
      setHistorySaved(true);
      if (parentHistoryId) {
        clearLineageParent();
      }
      return historyId;
    },
    [addEntry, config.tool, config.model, config.hints, diagnostics],
  );

  const sendComfyUi = useCallback(
    async (
      prompt: string,
      sport?: AthleticSport | null,
      historyId?: string,
      options?: {
        explicitNegative?: string;
        inputImage?: File | null;
        inputImageFilename?: string;
        inputImageUrl?: string;
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
        queueParamsBase?: WorkflowParamValues;
        qualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile;
      },
    ) => {
      if (!prompt) {
        return;
      }

      setComfyUiStatus("Queueing…");
      try {
        const { positive: preparedPrompt, negative: negativePrompt } =
          await prepareQueuePrompts({
            model: config.model,
            positive: injectLoraTriggers(prompt),
            hints: config.hints,
            sport,
            tool: config.tool,
            explicitNegative: options?.explicitNegative,
          });

        const preflight = await runWorkflowPreflight({
          model: config.model,
          prompts: [preparedPrompt],
          negativePrompt,
          tool: config.tool,
          queueParams: options?.queueParamsBase,
          hasInputImage: Boolean(
            options?.inputImage ||
              options?.inputImageUrl?.trim() ||
              options?.inputImageFilename?.trim(),
          ),
          hasMaskImage: Boolean(
            options?.maskImage ||
              options?.maskImageUrl?.trim() ||
              options?.maskImageFilename?.trim(),
          ),
        });
        if (!preflight.ok) {
          throw new Error(
            preflight.issues
              .filter((issue) => issue.severity === "error")
              .map((issue) => issue.message)
              .join(" · ") || "Workflow pre-flight failed.",
          );
        }

        let inputImageFilename = options?.inputImageFilename?.trim();
        if (options?.inputImage || options?.inputImageUrl?.trim()) {
          setComfyUiStatus("Uploading image to ComfyUI…");
          inputImageFilename = await resolveQueueInputImageFilename({
            file: options.inputImage,
            filename: options.inputImageFilename,
            imageUrl: options.inputImageUrl,
            model: config.model,
          });
        }

        let maskImageFilename = options?.maskImageFilename?.trim();
        if (options?.maskImage || options?.maskImageUrl?.trim()) {
          setComfyUiStatus("Uploading mask to ComfyUI…");
          maskImageFilename = await resolveQueueInputImageFilename({
            file: options.maskImage,
            filename: options.maskImageFilename,
            imageUrl: options.maskImageUrl,
            model: config.model,
          });
        }

        const queueParams = resolveQueueParams({
          model: config.model,
          tool: config.tool,
          base: options?.queueParamsBase,
          inputImageFilename,
          maskImageFilename,
          qualityProfile: options?.qualityProfile,
        });
        const runtime = resolveRuntimeForQueue(config.model, config.tool);
        const autoSaveEnabled = loadComfyUiSettings().autoSaveHistoryOnQueue !== false;
        const resolvedHistoryId =
          historyId ??
          (autoSaveEnabled && !historySaved
            ? saveHistory({
                prompt: preparedPrompt,
                hints: config.hints,
                parentHistoryId: resolveParentHistoryId(),
              })
            : undefined);

        const response = await fetch("/api/comfyui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: preparedPrompt,
            negativePrompt,
            model: config.model,
            params: queueParams,
            ...(runtime ? { comfy: runtime } : {}),
          }),
        });

        const data = (await response.json()) as {
          ok?: boolean;
          promptId?: string;
          error?: string;
          comfyUrl?: string;
          workflowSource?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "ComfyUI queue failed.");
        }

        setComfyUiStatus(
          [
            data.promptId ? `prompt_id ${data.promptId}` : "queued",
            data.comfyUrl,
            data.workflowSource ? `workflow: ${data.workflowSource}` : null,
            negativePrompt ? "with negative" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );

        if (data.promptId) {
          setComfyUiJob({
            promptId: data.promptId,
            status: "pending",
            statusMessage: "Submitted to ComfyUI",
            comfyUrl: data.comfyUrl,
          });
          trackComfyUiJob({
            promptId: data.promptId,
            prompt: preparedPrompt,
            negativePrompt,
            comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
            historyId: resolvedHistoryId,
            queueParams,
            queueQualityProfile: runtime?.queueQualityProfile,
          });
          markOnboardingFirstQueue();
          void dispatchWebhook({
            event: "comfyui.job.queued",
            promptId: data.promptId,
            prompt: preparedPrompt,
            negativePrompt,
            model: config.model,
            tool: config.tool,
            status: "queued",
            queueParams,
            completedAt: Date.now(),
          });
        }
      } catch (err) {
        setComfyUiStatus(err instanceof Error ? err.message : "ComfyUI failed.");
      }
    },
    [config.model, config.tool, config.hints, fetchNegative, saveHistory, trackComfyUiJob, historySaved],
  );

  const previewWorkflow = useCallback(
    async (prompt: string, sport?: AthleticSport | null) => {
      if (!prompt.trim()) {
        return;
      }

      setPreviewStatus("Building preview…");
      setWorkflowPreview(null);
      try {
        const { positive: preparedPrompt, negative: negativePrompt } =
          await prepareQueuePrompts({
            model: config.model,
            positive: prompt,
            hints: config.hints,
            sport,
            tool: config.tool,
          });

        const preview = await fetchWorkflowPreview({
          prompt: preparedPrompt,
          negativePrompt,
          model: config.model,
          params: resolveQueueParams({ model: config.model, tool: config.tool }),
        });
        setWorkflowPreview(preview);
        setPreviewStatus("Workflow preview ready (not queued).");
      } catch (err) {
        setPreviewStatus(err instanceof Error ? err.message : "Preview failed.");
      }
    },
    [config.hints, config.model, config.tool],
  );

  const sendBatchComfyUi = useCallback(
    async (prompts: string[], sport?: AthleticSport | null) => {
      const filtered = prompts.map((entry) => entry.trim()).filter(Boolean);
      if (filtered.length === 0) {
        return;
      }

      setComfyUiStatus(`Queueing ${filtered.length}…`);
      try {
        const rawNegative = modelUsesNegativePrompt(config.model)
          ? await resolveQueueNegativePromptRaw({
              model: config.model,
              hints: config.hints,
              sport,
              tool: config.tool,
            })
          : undefined;
        const steered = applyQueuePromptSteering({
          positive: injectLoraTriggers(filtered[0] ?? ""),
          negative: rawNegative,
          model: config.model,
        });
        const negativePrompt = steered.negative;
        const prepared = filtered.map((entry) =>
          applyQueuePromptSteering({
            positive: injectLoraTriggers(entry),
            negative: rawNegative,
            model: config.model,
          }).positive,
        );

        const runtime = resolveRuntimeForQueue(config.model, config.tool);
        const paramsPerPrompt = prepared.map((_, index) =>
          resolveQueueParams({
            model: config.model,
            tool: config.tool,
            base: {
              seed: String(Math.floor(Math.random() * 2 ** 32) + index),
            },
          }),
        );

        const preflight = await runWorkflowPreflight({
          model: config.model,
          prompts: prepared,
          negativePrompt,
          tool: config.tool,
          queueParams: paramsPerPrompt[0],
        });
        if (!preflight.ok) {
          throw new Error(
            preflight.issues
              .filter((issue) => issue.severity === "error")
              .map((issue) => issue.message)
              .join(" · ") || "Workflow pre-flight failed.",
          );
        }

        const autoSaveEnabled = loadComfyUiSettings().autoSaveHistoryOnQueue !== false;
        const batchHistoryId =
          autoSaveEnabled && !historySaved && prepared.length > 0
            ? saveHistory({
                prompt: prepared.join("\n\n---\n\n"),
                hints: config.hints,
                metadata: {
                  batchSize: prepared.length,
                  batchPrompts: prepared,
                },
                parentHistoryId: resolveParentHistoryId(),
              })
            : undefined;

        const response = await fetch("/api/comfyui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompts: prepared,
            negativePrompt,
            model: config.model,
            paramsPerPrompt,
            ...(runtime ? { comfy: runtime } : {}),
          }),
        });

        const data = (await response.json()) as {
          ok?: boolean;
          queued?: number;
          failed?: number;
          error?: string;
          comfyUrl?: string;
          results?: Array<{
            ok?: boolean;
            promptId?: string;
            comfyUrl?: string;
          }>;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "ComfyUI batch queue failed.");
        }

        for (const [index, result] of (data.results ?? []).entries()) {
          if (!result.promptId) {
            continue;
          }
          trackComfyUiJob(
            {
              promptId: result.promptId,
              prompt: prepared[index] ?? prepared[0] ?? "",
              negativePrompt,
              comfyUrl: result.comfyUrl ?? data.comfyUrl ?? "http://127.0.0.1:8188",
              queueParams: paramsPerPrompt[index] ?? paramsPerPrompt[0],
              historyId: index === 0 ? batchHistoryId : undefined,
              queueQualityProfile: runtime?.queueQualityProfile,
            },
            false,
          );
        }

        void dispatchWebhook({
          event: "comfyui.batch.completed",
          tool: config.tool,
          model: config.model,
          queued: data.queued ?? prepared.length,
          failed: data.failed,
          completedAt: Date.now(),
          message: `Batch queued ${data.queued ?? prepared.length}/${prepared.length}`,
        });

        setComfyUiStatus(
          [
            `queued ${data.queued ?? prepared.length}/${prepared.length}`,
            data.failed ? `${data.failed} failed` : null,
            data.comfyUrl,
            negativePrompt ? "with negative" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );
      } catch (err) {
        setComfyUiStatus(err instanceof Error ? err.message : "ComfyUI batch failed.");
      }
    },
    [config.hints, config.model, config.tool, fetchNegative, trackComfyUiJob, saveHistory, historySaved],
  );

  const copyPromptPair = useCallback(
    async (
      prompt: string,
      sport?: AthleticSport | null,
      explicitNegative?: string,
    ) => {
      if (!prompt) {
        return;
      }

      try {
        const { positive, negative } = await prepareQueuePrompts({
          model: config.model,
          positive: prompt,
          hints: config.hints,
          sport,
          tool: config.tool,
          explicitNegative,
        });
        const text = formatPromptPair({
          positive,
          negative,
          model: config.model,
        });
        await navigator.clipboard.writeText(text);
        setPairCopied(true);
        window.setTimeout(() => setPairCopied(false), 2000);
      } catch {
        setFixStatus("Could not copy prompt pair.");
      }
    },
    [config.hints, config.model, config.tool],
  );

  const compactPrompt = useCallback(
    async (prompt: string, onCompacted: (next: string) => void) => {
      if (!prompt.trim()) {
        return;
      }

      setCompactStatus("Compacting…");
      try {
        const response = await fetch("/api/compact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            model: config.model,
            detail: config.detail ?? "balanced",
          }),
        });

        const data = (await response.json()) as {
          prompt?: string;
          beforeChars?: number;
          afterChars?: number;
          maxChars?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Compact failed.");
        }

        if (data.prompt) {
          onCompacted(data.prompt);
          await lintPrompt(data.prompt, config.hints);
        }

        setCompactStatus(
          data.beforeChars != null && data.afterChars != null
            ? `Compacted ${data.beforeChars} → ${data.afterChars} chars (max ${data.maxChars})`
            : "Compacted to model limit.",
        );
      } catch (err) {
        setCompactStatus(err instanceof Error ? err.message : "Compact failed.");
      }
    },
    [config.model, config.detail, config.hints, lintPrompt],
  );

  const reformatForModel = useCallback(
    async (
      prompt: string,
      onReformatted: (next: string) => void,
      targetModel?: ComfyImageModel,
    ) => {
      const model = targetModel ?? config.reformatTarget;
      if (!prompt.trim() || !model) {
        return;
      }

      setReformatStatus(`Reformatting for ${model}…`);
      try {
        const response = await fetch("/api/format", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: prompt,
            mode: "positive",
            model,
            detail: config.detail ?? "balanced",
            smartFormat: true,
          }),
        });

        const data = (await response.json()) as { prompt?: string; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Reformat failed.");
        }

        if (data.prompt) {
          onReformatted(data.prompt);
          saveHistory({
            prompt: data.prompt,
            hints: config.hints,
            parentHistoryId: resolveParentHistoryId(),
            metadata: { reformattedFrom: config.model, reformattedTo: model },
          });
        }

        setReformatStatus(`Reformatted for ${model}.`);
      } catch (err) {
        setReformatStatus(err instanceof Error ? err.message : "Reformat failed.");
      }
    },
    [config.detail, config.hints, config.model, config.reformatTarget, saveHistory],
  );

  const exportSidecar = useCallback(
    async (
      prompt: string,
      extras?: {
        comfyNode?: string;
        metadata?: Record<string, unknown>;
        variationSeed?: string | null;
      },
    ) => {
      if (!prompt.trim()) {
        return;
      }

      let negative: string | undefined;
      if (modelUsesNegativePrompt(config.model)) {
        negative = (await fetchNegative()) ?? undefined;
      }

      downloadPromptSidecar(
        buildPromptSidecar({
          positive: prompt,
          negative,
          model: config.model,
          detail: config.detail,
          comfyNode: extras?.comfyNode,
          hints: config.hints,
          tool: config.tool,
          variationSeed: extras?.variationSeed ?? undefined,
          diagnostics,
          metadata: extras?.metadata,
        }),
      );
    },
    [config.model, config.detail, config.hints, config.tool, diagnostics, fetchNegative],
  );

  const runExportPipeline = useCallback(
    async (
      prompt: string,
      onUpdate: (next: string) => void,
      options?: {
        sport?: AthleticSport | null;
        maxChars?: number;
        queueComfyUi?: boolean;
        inputImage?: File | null;
        inputImageFilename?: string;
        inputImageUrl?: string;
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
      },
    ) => {
      if (!prompt.trim()) {
        return;
      }

      setPipelineStatus("Linting…");
      let current = prompt;

      try {
        const lint = await lintPrompt(current, config.hints);
        const hasErrors = lint?.issues.some((issue) => issue.severity === "error");

        if (hasErrors && config.autoFixRules !== false) {
          setPipelineStatus("Applying rule fixes…");
          const data = await applyRuleFix(current, config.hints);
          if (data.prompt) {
            current = data.prompt;
            onUpdate(current);
            await lintPrompt(current, config.hints);
          }
        }

        if (options?.maxChars && current.length > options.maxChars) {
          setPipelineStatus("Compacting to model limit…");
          const response = await fetch("/api/compact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: current,
              model: config.model,
              detail: config.detail ?? "balanced",
            }),
          });
          const data = (await response.json()) as { prompt?: string; error?: string };
          if (response.ok && data.prompt) {
            current = data.prompt;
            onUpdate(current);
          }
        }

        setPipelineStatus("Copying prompt pair…");
        await copyPromptPair(current, options?.sport);

        if (options?.queueComfyUi) {
          setPipelineStatus("Queueing ComfyUI…");
          await sendComfyUi(current, options?.sport, undefined, {
            inputImage: options?.inputImage,
            inputImageFilename: options?.inputImageFilename,
            inputImageUrl: options?.inputImageUrl,
            maskImage: options?.maskImage,
            maskImageFilename: options?.maskImageFilename,
            maskImageUrl: options?.maskImageUrl,
          });
          setPipelineStatus("Pipeline complete · pair copied · queued");
        } else {
          setPipelineStatus("Pipeline complete · pair copied");
        }
      } catch (err) {
        setPipelineStatus(err instanceof Error ? err.message : "Pipeline failed.");
      }
    },
    [
      applyRuleFix,
      config.autoFixRules,
      config.detail,
      config.hints,
      config.model,
      copyPromptPair,
      lintPrompt,
      sendComfyUi,
    ],
  );

  const improveOutput = useCallback(
    (prompt: string, previewUrl?: string | null) => {
      if (!prompt.trim()) {
        return;
      }
      startImproveFromResult({
        prompt,
        previewUrl,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool],
  );

  const refineOutput = useCallback(
    (prompt: string, previewUrl?: string | null, negativePrompt?: string) => {
      if (!prompt.trim()) {
        return;
      }
      startRefineFromResult({
        prompt,
        previewUrl,
        negativePrompt,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.model, config.tool],
  );

  const editPromptOutput = useCallback(
    (
      prompt: string,
      previewUrl?: string | null,
      negativePrompt?: string,
      hints?: string,
    ) => {
      if (!prompt.trim()) {
        return;
      }
      startPromptEditorFromResult({
        prompt,
        previewUrl,
        negativePrompt,
        hints: hints ?? config.hints,
        model: config.model,
        tool: config.tool,
      });
    },
    [config.hints, config.model, config.tool],
  );

  return {
    preDiagnostics,
    diagnostics,
    historySaved,
    fixStatus,
    comfyUiStatus,
    comfyUiJob,
    comfyUiPreviewUrl,
    pairCopied,
    resetStatuses,
    runPreLint,
    lintPrompt,
    finalizePrompt,
    fixPrompt,
    saveHistory,
    sendComfyUi,
    sendBatchComfyUi,
    previewWorkflow,
    workflowPreview,
    previewStatus,
    copyPromptPair,
    compactPrompt,
    reformatForModel,
    compactStatus,
    reformatStatus,
    runExportPipeline,
    exportSidecar,
    pipelineStatus,
    setDiagnostics,
    improveOutput,
    refineOutput,
    editPromptOutput,
  };
}
