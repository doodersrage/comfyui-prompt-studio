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
import type { ComfyImageModel } from "@/lib/comfy-models/client";
import type { DetailLevel } from "@/lib/detail-level";
import type { AthleticSport } from "@/lib/athletic-sport-profiles";
import { resolveRuntimeForQueueAsync } from "@/lib/comfyui-runtime-for-model";
import { resolveModelForQueueTool } from "@/lib/queue-tool-model";
import { guardQueueQualityForVram } from "@/lib/vram-queue-guard";
import {
  holdMaxGenerateJob,
  shouldHoldMaxUntilIdle,
} from "@/lib/held-max-queue";
import { rememberedSamplerOverrides } from "@/lib/sampler-memory";
import { startImproveFromResult, startPromptEditorFromResult, startRefineFromResult } from "@/lib/improve-output";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import { parseWorkflowJson } from "@/lib/comfyui-config";
import {
  galleryEntryPrimaryViewUrl,
} from "@/lib/comfyui-gallery";
import { scheduleComfyGalleryPoll } from "@/lib/comfyui-gallery-poller";
import { registerComfyGalleryJob } from "@/lib/comfyui-gallery-client";
import {
  createComfyUiClientId,
  openComfyPreviewSocketBeforeQueue,
  type ComfyUiWebSocketSubscription,
} from "@/lib/comfyui-websocket";
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
import {
  loadComfyUiSettings,
  resolveSharedEffectiveSessionLoraIds,
} from "@/lib/comfyui-settings";
import { loadSettingsCache } from "@/lib/settings-cache";
import {
  computePromptContentHash,
  nextPromptVersionFields,
} from "@/lib/prompt-versioning";
import { loadPromptHistoryStore } from "@/lib/prompt-history";
import { resolveQueueInputImageFilename } from "@/lib/queue-input-image";
import { resolveQueueParams } from "@/lib/queue-params-settings";
import { toastHeldMax, toastQueueOutcome } from "@/lib/app-toast";
import { applyQueuePromptSteering, prepareQueuePrompts } from "@/lib/queue-prompt-prep";
import { resolveQueueNegativePromptRaw } from "@/lib/queue-negative";
import { joinQueueStatusNotes } from "@/lib/queue-status-notes";
import { runWorkflowPreflight } from "@/lib/workflow-preflight";
import { runPluginQueuePreflight } from "@/lib/plugin-queue-hooks";
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
        clientId?: string;
        historyId?: string;
        queueParams?: WorkflowParamValues;
        queueQualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile;
        /** Actual model queued (may differ from picker when Generate remaps Edit Lightning). */
        model?: ComfyImageModel;
        sessionActiveLoraIds?: string[];
      },
      showPreview = true,
    ) => {
      const galleryEntry = registerComfyGalleryJob({
        promptId: input.promptId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        tool: config.tool,
        model: input.model ?? config.model,
        comfyUrl: input.comfyUrl,
        clientId: input.clientId,
        historyId: input.historyId,
        queueParams: input.queueParams,
        queueQualityProfile: input.queueQualityProfile,
        sessionActiveLoraIds: input.sessionActiveLoraIds,
        projectId: loadActiveProjectId(),
      });

      if (input.historyId) {
        linkGalleryToHistory(input.promptId, input.historyId);
        attachGalleryPromptIdToHistory(
          input.historyId,
          input.promptId,
          galleryEntry.id,
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
          progressValue: undefined,
          progressMax: undefined,
          progressNode: undefined,
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
      const shared = loadSettingsCache().shared;
      const versioningEnabled = shared.promptVersioningEnabled !== false;

      let versionFields:
        | {
            promptVersion: number;
            promptContentHash: string;
            versionRootId: string;
          }
        | undefined;
      let entryId: string | undefined;

      if (versioningEnabled) {
        entryId = crypto.randomUUID();
        const parent = parentHistoryId
          ? loadPromptHistoryStore().find((entry) => entry.id === parentHistoryId)
          : undefined;
        versionFields = nextPromptVersionFields({
          contentHash: computePromptContentHash({
            prompt: input.prompt,
            model: config.model,
            loraIds: shared.sessionActiveLoraIds,
          }),
          parent: parent
            ? {
                id: parent.id,
                promptVersion: parent.promptVersion,
                versionRootId: parent.versionRootId,
              }
            : null,
          newEntryId: entryId,
        });
      }

      const historyId = addEntry({
        ...(entryId ? { id: entryId } : {}),
        tool: config.tool,
        prompt: input.prompt,
        hints: input.hints ?? config.hints,
        model: config.model,
        diagnostics: diagnostics ?? undefined,
        ...(versionFields ?? {}),
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
        /** Extra figures for Compose (Figure 2–4). Index 0 is ignored — use inputImage. */
        inputImages?: Array<File | null | undefined>;
        inputImageUrls?: Array<string | undefined>;
        inputImageFilenames?: string[];
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
        controlImage?: File | null;
        controlImageFilename?: string;
        controlImageUrl?: string;
        /** Extra control images for multi-ControlNet stack (index 0 ignored — use controlImage). */
        controlImages?: Array<File | null | undefined>;
        controlImageUrls?: Array<string | undefined>;
        controlImageFilenames?: string[];
        queueParamsBase?: WorkflowParamValues;
        qualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile;
        /** Merged into runtime customTokens before inject (e.g. {{REGION_*}}). */
        customTokens?: Array<{ token: string; value: string }>;
        /** Multi-slot regional edit for AttentionCouple / {{REGION_*}} binding. */
        regionalSlots?: import("@/lib/regional-prompt-slots").RegionalPromptSlot[];
        /** Compose: lock identity from Figure 1 via IP-Adapter after upload. */
        identityLock?: boolean;
        identityLockStrength?: number;
        identityKind?: import("@/lib/compose-identity-lock").ComposeIdentityKind;
      },
    ) => {
      if (!prompt) {
        return;
      }

      setComfyUiStatus("Queueing…");
      try {
        const pluginPreflight = await runPluginQueuePreflight({
          event: "queue-preflight",
          prompt,
          model: config.model,
          tool: config.tool,
          denoise: options?.queueParamsBase?.denoise,
          cfg: options?.queueParamsBase?.cfg,
        });
        if (pluginPreflight.blocked) {
          throw new Error(
            pluginPreflight.reason ||
              pluginPreflight.messages.join(" · ") ||
              "Plugin hook blocked the queue.",
          );
        }
        const workingPrompt = pluginPreflight.payload.prompt || prompt;
        const pluginNegative = pluginPreflight.payload.negativePrompt;
        const pluginDenoise = pluginPreflight.payload.denoise;
        const pluginCfg = pluginPreflight.payload.cfg;

        const baseRuntime = await resolveRuntimeForQueueAsync(
          config.model,
          config.tool,
        );
        const queueModel = resolveModelForQueueTool(config.model, config.tool);
        const vramGuard = await guardQueueQualityForVram({
          profile: options?.qualityProfile ?? baseRuntime.queueQualityProfile,
          runtime: baseRuntime,
        });
        const runtime = {
          ...(vramGuard.runtime ?? baseRuntime),
        };
        const effectiveQualityProfile = vramGuard.profile;

        if (options?.customTokens?.length) {
          const byToken = new Map(
            (runtime.customTokens ?? []).map((entry) => [entry.token, entry]),
          );
          for (const entry of options.customTokens) {
            if (entry.token?.trim() && entry.value?.trim()) {
              byToken.set(entry.token.trim(), {
                token: entry.token.trim(),
                value: entry.value.trim(),
              });
            }
          }
          runtime.customTokens = [...byToken.values()];
        }

        if (options?.regionalSlots?.length) {
          runtime.regionalSlots = options.regionalSlots;
        }

        const { positive: preparedPrompt, negative: negativePrompt } =
          await prepareQueuePrompts({
            model: queueModel,
            positive: injectLoraTriggers(workingPrompt),
            hints: config.hints,
            sport,
            tool: config.tool,
            explicitNegative: options?.explicitNegative ?? pluginNegative,
          });

        const preflight = await runWorkflowPreflight({
          model: queueModel,
          prompts: [preparedPrompt],
          negativePrompt,
          tool: config.tool,
          queueParams: options?.queueParamsBase,
          hasInputImage: Boolean(
            options?.inputImage ||
              options?.inputImageUrl?.trim() ||
              options?.inputImageFilename?.trim() ||
              options?.inputImages?.some(Boolean) ||
              options?.inputImageUrls?.some((url) => url?.trim()) ||
              options?.inputImageFilenames?.some((name) => name?.trim()),
          ),
          hasMaskImage: Boolean(
            options?.maskImage ||
              options?.maskImageUrl?.trim() ||
              options?.maskImageFilename?.trim(),
          ),
          hasControlImage: Boolean(
            options?.controlImage ||
              options?.controlImageUrl?.trim() ||
              options?.controlImageFilename?.trim() ||
              options?.controlImages?.some(Boolean) ||
              options?.controlImageUrls?.some((url) => url?.trim()) ||
              options?.controlImageFilenames?.some((name) => name?.trim()),
          ),
          comfy: runtime,
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
        const uploadedFilenames: string[] = [
          ...(options?.inputImageFilenames ?? []).map((name) => name?.trim() ?? ""),
        ];
        while (uploadedFilenames.length < 4) {
          uploadedFilenames.push("");
        }

        if (options?.inputImage || options?.inputImageUrl?.trim()) {
          setComfyUiStatus("Uploading image to ComfyUI…");
          inputImageFilename = await resolveQueueInputImageFilename({
            file: options.inputImage,
            filename: options.inputImageFilename,
            imageUrl: options.inputImageUrl,
            model: queueModel,
          });
          if (inputImageFilename) {
            uploadedFilenames[0] = inputImageFilename;
          }
        } else if (inputImageFilename) {
          uploadedFilenames[0] = inputImageFilename;
        }

        for (let i = 1; i < 4; i += 1) {
          const file = options?.inputImages?.[i];
          const imageUrl = options?.inputImageUrls?.[i];
          const existing = uploadedFilenames[i]?.trim();
          if (!file && !imageUrl?.trim()) {
            continue;
          }
          setComfyUiStatus(`Uploading Figure ${i + 1} to ComfyUI…`);
          const uploaded = await resolveQueueInputImageFilename({
            file: file ?? undefined,
            filename: existing || undefined,
            imageUrl: imageUrl?.trim() || undefined,
            model: queueModel,
          });
          if (uploaded) {
            uploadedFilenames[i] = uploaded;
          }
        }

        const inputImageFilenames = uploadedFilenames
          .map((name) => name.trim())
          .filter(Boolean);
        if (!inputImageFilename && inputImageFilenames[0]) {
          inputImageFilename = inputImageFilenames[0];
        }

        let maskImageFilename = options?.maskImageFilename?.trim();
        if (options?.maskImage || options?.maskImageUrl?.trim()) {
          setComfyUiStatus("Uploading mask to ComfyUI…");
          maskImageFilename = await resolveQueueInputImageFilename({
            file: options.maskImage,
            filename: options.maskImageFilename,
            imageUrl: options.maskImageUrl,
            model: queueModel,
          });
        }

        let controlImageFilename = options?.controlImageFilename?.trim();
        const controlUploaded: string[] = [
          ...(options?.controlImageFilenames ?? []).map((name) => name?.trim() ?? ""),
        ];
        while (controlUploaded.length < 4) {
          controlUploaded.push("");
        }
        if (options?.controlImage || options?.controlImageUrl?.trim()) {
          setComfyUiStatus("Uploading control image to ComfyUI…");
          controlImageFilename = await resolveQueueInputImageFilename({
            file: options.controlImage,
            filename: options.controlImageFilename,
            imageUrl: options.controlImageUrl,
            model: queueModel,
          });
          if (controlImageFilename) {
            controlUploaded[0] = controlImageFilename;
          }
        } else if (controlImageFilename) {
          controlUploaded[0] = controlImageFilename;
        }
        for (let i = 1; i < 4; i += 1) {
          const file = options?.controlImages?.[i];
          const imageUrl = options?.controlImageUrls?.[i];
          const existing = controlUploaded[i]?.trim();
          if (!file && !imageUrl?.trim() && !existing) {
            continue;
          }
          if (!file && !imageUrl?.trim()) {
            continue;
          }
          setComfyUiStatus(`Uploading control image ${i + 1} to ComfyUI…`);
          const uploaded = await resolveQueueInputImageFilename({
            file: file ?? undefined,
            filename: existing || undefined,
            imageUrl: imageUrl?.trim() || undefined,
            model: queueModel,
          });
          if (uploaded) {
            controlUploaded[i] = uploaded;
          }
        }
        const controlImageFilenames = controlUploaded
          .map((name) => name.trim())
          .filter(Boolean);
        if (!controlImageFilename && controlImageFilenames[0]) {
          controlImageFilename = controlImageFilenames[0];
        }
        const workflow = runtime?.workflowJson?.trim()
          ? (parseWorkflowJson(runtime.workflowJson) ?? undefined)
          : undefined;

        const queueParams = resolveQueueParams({
          model: queueModel,
          tool: config.tool,
          base: options?.queueParamsBase,
          workflow,
          inputImageFilename,
          inputImageFilenames:
            inputImageFilenames.length > 0 ? inputImageFilenames : undefined,
          maskImageFilename,
          controlImageFilename,
          controlImageFilenames:
            controlImageFilenames.length > 0 ? controlImageFilenames : undefined,
          qualityProfile: effectiveQualityProfile,
        });

        if (pluginDenoise != null && pluginDenoise.toString().trim() !== "") {
          queueParams.denoise = pluginDenoise;
        }
        if (pluginCfg != null && pluginCfg.toString().trim() !== "") {
          queueParams.cfg = pluginCfg;
        }

        if (options?.identityLock) {
          const { buildComposeIdentityLockQueuePatch } = await import(
            "@/lib/compose-identity-lock"
          );
          const identityPatch = buildComposeIdentityLockQueuePatch({
            enabled: true,
            strength: options.identityLockStrength,
            identityKind: options.identityKind,
            inputImageFilename,
          });
          if (identityPatch) {
            Object.assign(queueParams, identityPatch);
          }
        }

        if (
          effectiveQualityProfile === "max" &&
          (await shouldHoldMaxUntilIdle())
        ) {
          holdMaxGenerateJob({
            prompt: preparedPrompt,
            negativePrompt,
            model: queueModel,
            tool: config.tool,
            params: queueParams,
            comfy: runtime,
            qualityProfile: "max",
          });
          setComfyUiStatus(
            "Max held until ComfyUI queue is idle (Queue → Orchestration).",
          );
          toastHeldMax({ text: "Max job held until ComfyUI is idle" });
          return;
        }

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

        const clientId = createComfyUiClientId();
        // Hint only — the live bridge resolves the real Comfy URL server-side
        // (Docker hostname safe). Do not default to 127.0.0.1 here.
        const previewComfyUrlHint =
          runtime?.apiUrl?.trim() ||
          loadComfyUiSettings().apiUrl?.trim() ||
          undefined;

        // Open same-origin live bridge before /prompt so Comfy can bind previews to client_id.
        let earlyPreviewSocket: ComfyUiWebSocketSubscription | undefined;
        if (loadComfyUiSettings().useWebSocketProgress !== false) {
          try {
            earlyPreviewSocket = await openComfyPreviewSocketBeforeQueue({
              clientId,
              comfyUrl: previewComfyUrlHint,
            });
          } catch {
            earlyPreviewSocket = undefined;
          }
        }

        try {
          const response = await fetch("/api/comfyui", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: preparedPrompt,
              negativePrompt,
              model: queueModel,
              params: queueParams,
              clientId,
              ...(runtime ? { comfy: runtime } : {}),
            }),
          });

          const data = (await response.json()) as {
            ok?: boolean;
            promptId?: string;
            error?: string;
            comfyUrl?: string;
            clientId?: string;
            workflowSource?: string;
          };

          if (!response.ok) {
            throw new Error(data.error ?? "ComfyUI queue failed.");
          }

          setComfyUiStatus(
            joinQueueStatusNotes(
              [
                data.promptId ? `prompt_id ${data.promptId}` : "queued",
                queueModel !== config.model ? `as ${queueModel}` : null,
                data.workflowSource ? `workflow: ${data.workflowSource}` : null,
                negativePrompt ? "with negative" : null,
                options?.identityLock && queueParams.ipAdapterImageFilename
                  ? `identity lock · ${
                      queueParams.identityKind === "instantid"
                        ? "InstantID"
                        : queueParams.identityKind === "pulid"
                          ? "PuLID"
                          : queueParams.identityKind === "auto"
                            ? "InstantID/PuLID auto"
                            : "IP-Adapter"
                    } ${Number(queueParams.ipAdapterStrength ?? 0.5).toFixed(2)}`
                  : null,
              ],
              {
                model: queueModel,
                qualityProfile: runtime?.queueQualityProfile,
                tool: config.tool,
                vramDowngraded: vramGuard.downgraded,
                samplerMemory:
                  Object.keys(rememberedSamplerOverrides(queueModel)).length > 0,
                hasInputImage: Boolean(inputImageFilename),
                comfyUrl: data.comfyUrl,
              },
            ),
          );
          toastQueueOutcome({
            ok: true,
            text: data.promptId
              ? `Queued to ComfyUI · ${data.promptId}`
              : "Queued to ComfyUI",
            href: "/gallery",
          });

          if (data.promptId) {
            earlyPreviewSocket?.setPromptId(data.promptId);
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
              comfyUrl:
                data.comfyUrl ?? previewComfyUrlHint ?? "http://127.0.0.1:8188",
              clientId: data.clientId ?? clientId,
              historyId: resolvedHistoryId,
              queueParams,
              queueQualityProfile: runtime?.queueQualityProfile,
              model: queueModel,
              sessionActiveLoraIds:
                resolveSharedEffectiveSessionLoraIds(queueModel),
            });
            // Let the gallery poller attach to the shared live session before we
            // drop the early ref (avoids aborting the bridge on refCount 0).
            const earlyToRelease = earlyPreviewSocket;
            earlyPreviewSocket = undefined;
            queueMicrotask(() => {
              earlyToRelease?.close();
            });
            markOnboardingFirstQueue();
            void dispatchWebhook({
              event: "comfyui.job.queued",
              promptId: data.promptId,
              prompt: preparedPrompt,
              negativePrompt,
              model: queueModel,
              tool: config.tool,
              status: "queued",
              queueParams,
              completedAt: Date.now(),
            });
          }
        } finally {
          earlyPreviewSocket?.close();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "ComfyUI failed.";
        setComfyUiStatus(message);
        toastQueueOutcome({ ok: false, text: message, href: "/queue" });
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
          model: resolveModelForQueueTool(config.model, config.tool),
          params: resolveQueueParams({
            model: resolveModelForQueueTool(config.model, config.tool),
            tool: config.tool,
          }),
          comfy: await resolveRuntimeForQueueAsync(config.model, config.tool),
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
        const baseRuntime = await resolveRuntimeForQueueAsync(
          config.model,
          config.tool,
        );
        const queueModel = resolveModelForQueueTool(config.model, config.tool);
        const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
        const runtime = vramGuard.runtime ?? baseRuntime;
        const rawNegative = modelUsesNegativePrompt(queueModel)
          ? await resolveQueueNegativePromptRaw({
              model: queueModel,
              hints: config.hints,
              sport,
              tool: config.tool,
            })
          : undefined;
        const steered = applyQueuePromptSteering({
          positive: injectLoraTriggers(filtered[0] ?? ""),
          negative: rawNegative,
          model: queueModel,
        });
        const negativePrompt = steered.negative;
        const prepared = filtered.map((entry) =>
          applyQueuePromptSteering({
            positive: injectLoraTriggers(entry),
            negative: rawNegative,
            model: queueModel,
          }).positive,
        );

        const paramsPerPrompt = prepared.map((_, index) =>
          resolveQueueParams({
            model: queueModel,
            tool: config.tool,
            base: {
              seed: String(Math.floor(Math.random() * 2 ** 32) + index),
            },
            qualityProfile: vramGuard.profile,
          }),
        );

        if (
          vramGuard.profile === "max" &&
          (await shouldHoldMaxUntilIdle())
        ) {
          for (const [index, prompt] of prepared.entries()) {
            holdMaxGenerateJob({
              prompt,
              negativePrompt,
              model: queueModel,
              tool: config.tool,
              params: paramsPerPrompt[index],
              comfy: runtime,
              qualityProfile: "max",
            });
          }
          setComfyUiStatus(
            `Held ${prepared.length} Max job(s) until ComfyUI queue is idle.`,
          );
          toastHeldMax({
            text: "Max jobs held until ComfyUI is idle",
            count: prepared.length,
          });
          return;
        }

        const preflight = await runWorkflowPreflight({
          model: queueModel,
          prompts: prepared,
          negativePrompt,
          tool: config.tool,
          queueParams: paramsPerPrompt[0],
          comfy: runtime,
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

        const batchClientId = createComfyUiClientId();
        const previewComfyUrlHint =
          runtime?.apiUrl?.trim() ||
          loadComfyUiSettings().apiUrl?.trim() ||
          undefined;

        let earlyPreviewSocket: ComfyUiWebSocketSubscription | undefined;
        if (loadComfyUiSettings().useWebSocketProgress !== false) {
          try {
            earlyPreviewSocket = await openComfyPreviewSocketBeforeQueue({
              clientId: batchClientId,
              comfyUrl: previewComfyUrlHint,
            });
          } catch {
            earlyPreviewSocket = undefined;
          }
        }

        try {
          const response = await fetch("/api/comfyui", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompts: prepared,
              negativePrompt,
              model: queueModel,
              paramsPerPrompt,
              clientId: batchClientId,
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
            if (index === 0) {
              earlyPreviewSocket?.setPromptId(result.promptId);
            }
            trackComfyUiJob(
              {
                promptId: result.promptId,
                prompt: prepared[index] ?? prepared[0] ?? "",
                negativePrompt,
                comfyUrl:
                  result.comfyUrl ??
                  data.comfyUrl ??
                  previewComfyUrlHint ??
                  "http://127.0.0.1:8188",
                clientId: batchClientId,
                queueParams: paramsPerPrompt[index] ?? paramsPerPrompt[0],
                historyId: index === 0 ? batchHistoryId : undefined,
                queueQualityProfile: runtime?.queueQualityProfile,
                model: queueModel,
                sessionActiveLoraIds:
                  resolveSharedEffectiveSessionLoraIds(queueModel),
              },
              false,
            );
          }
          const earlyToRelease = earlyPreviewSocket;
          earlyPreviewSocket = undefined;
          queueMicrotask(() => {
            earlyToRelease?.close();
          });

          void dispatchWebhook({
            event: "comfyui.batch.completed",
            tool: config.tool,
            model: queueModel,
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
          toastQueueOutcome({
            ok: !data.failed,
            text: data.failed
              ? `Batch queued with ${data.failed} failure(s)`
              : `Batch queued ${data.queued ?? prepared.length}/${prepared.length}`,
            href: data.failed ? "/queue" : "/gallery",
          });
        } finally {
          earlyPreviewSocket?.close();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "ComfyUI batch failed.";
        setComfyUiStatus(message);
        toastQueueOutcome({ ok: false, text: message, href: "/queue" });
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
        inputImages?: Array<File | null | undefined>;
        inputImageUrls?: Array<string | undefined>;
        inputImageFilenames?: string[];
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
        queueParamsBase?: WorkflowParamValues;
        identityLock?: boolean;
        identityLockStrength?: number;
        identityKind?: import("@/lib/compose-identity-lock").ComposeIdentityKind;
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
            inputImages: options?.inputImages,
            inputImageUrls: options?.inputImageUrls,
            inputImageFilenames: options?.inputImageFilenames,
            maskImage: options?.maskImage,
            maskImageFilename: options?.maskImageFilename,
            maskImageUrl: options?.maskImageUrl,
            queueParamsBase: options?.queueParamsBase,
            identityLock: options?.identityLock,
            identityLockStrength: options?.identityLockStrength,
            identityKind: options?.identityKind,
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
