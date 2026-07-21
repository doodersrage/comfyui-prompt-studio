"use client";

import type { ComfyImageModel } from "./comfy-models";
import {
  registerComfyGalleryJob,
} from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { scheduleRefineAfterUpscaleComplete } from "./gallery-pending-actions";
import {
  resolveWorkflowGraphEnrichOptions,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from "./comfyui-config";
import { resolveQueueInputImageFilename } from "./queue-input-image";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import type { QueueQualityProfile } from "./queue-quality-profile";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import {
  refreshQueueImageParamsForRequeue,
  resolveRequeueImageUrlsFromEntry,
  auditRequeueImageReadiness,
} from "./queue-requeue-images";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { findGalleryEntryForHistory } from "./prompt-lineage";
import { runWorkflowPreflight } from "./workflow-preflight";
import {
  buildGalleryUpscaleWorkflow,
  resolveGalleryOutputImageUrl,
} from "./gallery-output-upscale";
import { isQwenLightningModel } from "./model-sampling-patch";
import {
  appendPortraitRefineNegative,
  buildGalleryRefineWorkflow,
  galleryRefineQueueParams,
} from "./gallery-output-refine";
import { findLibraryUpscaleWorkflowForModel } from "./workflow-library-upscale";
import { isUpscaleModelInstalled, resolveUpscaleModelFilename } from "./model-upscale-map";
import { fetchComfyObjectInfoCached } from "./comfyui-object-info-cache";
import { loadSettingsCache } from "./settings-cache";
import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from "./comfyui-settings";

type WorkflowPreviewResponse = {
  ok: boolean;
  replacements?: {
    positive: number;
    negative: number;
    params: Record<string, number>;
    custom?: Record<string, number>;
  };
  resolvedParams?: {
    seed: string;
    width: string;
    height: string;
    cfg: string;
    steps: string;
  };
  snippets?: Array<{ path: string; value: string }>;
  workflowJson?: string;
  truncated?: boolean;
  preflightIssues?: Array<{ severity: "error" | "warn"; message: string }>;
};

export type RequeueComfyJobInput = {
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  hints?: string;
  /** When true, override seed with a new random value for this job. */
  newSeed?: boolean;
  /** Recover width/steps/cfg from a prior gallery job when re-queueing. */
  queueParams?: WorkflowParamValues;
  /** Source image URL — re-uploaded for edit/img2img/inpaint workflows before queue. */
  sourceImageUrl?: string;
  /** Inpaint mask URL — re-uploaded when present. */
  maskImageUrl?: string;
  /** Override queue quality profile for this re-queue (draft / final / max). */
  qualityProfile?: QueueQualityProfile;
  /** Prior job quality profile — used when qualityProfile override is not set. */
  storedQualityProfile?: QueueQualityProfile;
  /** Gallery entry this re-queue derives from. */
  parentGalleryEntryId?: string;
  derivedKind?: ComfyGalleryEntry["derivedKind"];
  /** Upload sourceImageUrl even when the model/tool is normally text-to-image. */
  forceInputImage?: boolean;
  onStatus?: (message: string) => void;
};

export type RequeueComfyJobResult = {
  ok: boolean;
  promptId?: string;
  error?: string;
  comfyUrl?: string;
};

export function requeueSourceImageUrlFromEntry(
  entry: Pick<ComfyGalleryEntry, "comfyUrl" | "images" | "tool" | "model" | "queueParams" | "sourceImageUrl" | "maskImageUrl">,
): string | undefined {
  return resolveRequeueImageUrlsFromEntry(entry).sourceImageUrl;
}

export async function requeueUpscaleFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options: {
    qualityProfile: Extract<QueueQualityProfile, "final" | "max">;
    onStatus?: (message: string) => void;
    /** Queue low-denoise refine after upscale completes (uses upscaled output). */
    refineAfterComplete?: Extract<QueueQualityProfile, "final" | "max">;
  },
): Promise<RequeueComfyJobResult> {
  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: "No gallery output image available to upscale." };
  }

  options.onStatus?.("Uploading gallery output…");

  const model = (entry.model ?? "qwen-image-2512") as ComfyImageModel;
  let inputImageFilename: string | undefined;
  try {
    inputImageFilename = await resolveQueueInputImageFilename({
      imageUrl: outputUrl,
      model,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not upload gallery output.",
    };
  }

  if (!inputImageFilename?.trim()) {
    return { ok: false, error: "Could not upload gallery output to ComfyUI." };
  }

  const shared = loadSettingsCache().shared;
  const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings());
  const isLightning = isQwenLightningModel(model);
  const mappedUpscale =
    !isLightning && options.qualityProfile === "max"
      ? resolveUpscaleModelFilename(model, {
          upscaleMap: shared.modelUpscaleMap,
          customTokens: settings.customTokens,
        })
      : undefined;

  const objectInfo = await fetchComfyObjectInfoCached({
    comfyUrl: entry.comfyUrl ?? resolveComfyUiRuntime()?.apiUrl,
  });
  const upscaleModelFilename =
    mappedUpscale &&
    isUpscaleModelInstalled(mappedUpscale, objectInfo?.models.upscaleModels)
      ? mappedUpscale
      : undefined;
  if (mappedUpscale && !upscaleModelFilename) {
    options.onStatus?.(
      `Neural upscaler “${mappedUpscale}” not installed — using Lanczos…`,
    );
  }

  const baseRuntime = resolveRuntimeForQueue(model, entry.tool);
  const enrichOptions = resolveWorkflowGraphEnrichOptions(baseRuntime);

  const queueUpscale = async (
    neuralModel?: string,
  ): Promise<RequeueComfyJobResult> => {
    const libraryWorkflow =
      shared.useLibraryUpscaleWorkflow === true
        ? findLibraryUpscaleWorkflowForModel(model)
        : undefined;
    const workflow = libraryWorkflow
      ? (JSON.parse(libraryWorkflow.workflowJson) as Record<string, unknown>)
      : buildGalleryUpscaleWorkflow({
          qualityProfile: options.qualityProfile,
          upscaleModelFilename: neuralModel,
          enrichNeuralPolish: enrichOptions.enrichNeuralPolish,
          enrichSharpen: enrichOptions.enrichSharpen,
          model,
          availableUpscaleModels: objectInfo?.models.upscaleModels,
          supportsNeuralUpscaleTileSize: objectInfo?.supportsNeuralUpscaleTileSize,
        });

    const runtime: ComfyUiRuntimeConfig = {
      ...baseRuntime,
      workflowJson: JSON.stringify(workflow),
      workflowQueueOptimize: libraryWorkflow ? true : false,
      workflowGraphEnrich: libraryWorkflow ? baseRuntime.workflowGraphEnrich : false,
      directWorkflowPatching: true,
      queueQualityProfile: options.qualityProfile,
      ...(libraryWorkflow ? { workflowFileId: libraryWorkflow.id } : {}),
    };

    const params = { inputImageFilename };

    options.onStatus?.(
      libraryWorkflow
        ? `Queueing library upscale workflow “${libraryWorkflow.name}”…`
        : isLightning
          ? "Queueing Lightning pass-through (no reprocess)…"
          : neuralModel
            ? "Queueing neural upscale…"
            : "Queueing Lanczos upscale…",
    );

    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: entry.prompt.trim() || "upscale",
        negativePrompt: entry.negativePrompt,
        model,
        params,
        comfy: runtime,
      }),
    });

    const data = (await response.json()) as {
      ok?: boolean;
      promptId?: string;
      error?: string;
      comfyUrl?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? "ComfyUI upscale queue failed.",
        comfyUrl: data.comfyUrl,
      };
    }

    if (data.promptId) {
      registerComfyGalleryJob({
        promptId: data.promptId,
        prompt: entry.prompt.trim() || "upscale",
        negativePrompt: entry.negativePrompt,
        tool: entry.tool,
        model: entry.model,
        comfyUrl: data.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
        queueParams: { inputImageFilename },
        sourceImageUrl: outputUrl,
        queueQualityProfile: options.qualityProfile,
        parentGalleryEntryId: entry.id,
        derivedKind: "upscale",
        historyId: entry.historyId,
      });
      if (options.refineAfterComplete && !isLightning) {
        scheduleRefineAfterUpscaleComplete(data.promptId, options.refineAfterComplete);
      }
      void scheduleComfyGalleryPoll(data.promptId, {
        comfyUrl: data.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
        onStatus: options.onStatus,
      });
    }

    return {
      ok: true,
      promptId: data.promptId,
      comfyUrl: data.comfyUrl ?? entry.comfyUrl,
    };
  };

  let result = await queueUpscale(upscaleModelFilename);
  if (!result.ok && upscaleModelFilename) {
    options.onStatus?.(
      `Neural upscale failed (${result.error ?? "queue error"}) — retrying with Lanczos…`,
    );
    result = await queueUpscale(undefined);
  }

  return result;
}

export async function requeueRefineFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    qualityProfile?: Extract<QueueQualityProfile, "final" | "max">;
    onStatus?: (message: string) => void;
  },
): Promise<RequeueComfyJobResult> {
  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: "No gallery output image available to refine." };
  }

  options?.onStatus?.("Uploading gallery output…");

  const model = (entry.model ?? "qwen-image-2512") as ComfyImageModel;
  if (isQwenLightningModel(model)) {
    return {
      ok: false,
      error:
        "Img2img refine is disabled for Lightning models — use Final/Max Lanczos polish (or requeue a new seed) instead.",
    };
  }
  let inputImageFilename: string | undefined;
  try {
    inputImageFilename = await resolveQueueInputImageFilename({
      imageUrl: outputUrl,
      model,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not upload gallery output.",
    };
  }

  if (!inputImageFilename?.trim()) {
    return { ok: false, error: "Could not upload gallery output to ComfyUI." };
  }

  const profile = options?.qualityProfile ?? "final";
  const workflow = buildGalleryRefineWorkflow(model);
  const baseRuntime = resolveRuntimeForQueue(model, "refine");
  const params = galleryRefineQueueParams({
    inputImageFilename,
    profile,
    prompt: entry.prompt,
    queueParams: entry.queueParams,
  });

  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: false,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    queueQualityProfile: profile,
  };

  options?.onStatus?.("Queueing low-denoise refine…");

  const refineNegative = appendPortraitRefineNegative(entry.negativePrompt, entry.prompt);

  const response = await fetch("/api/comfyui", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: entry.prompt.trim() || "refine",
      negativePrompt: refineNegative,
      model,
      params,
      comfy: runtime,
    }),
  });

  const data = (await response.json()) as {
    ok?: boolean;
    promptId?: string;
    error?: string;
    comfyUrl?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      error: data.error ?? "ComfyUI refine queue failed.",
      comfyUrl: data.comfyUrl,
    };
  }

  if (data.promptId) {
    registerComfyGalleryJob({
      promptId: data.promptId,
      prompt: entry.prompt.trim() || "refine",
      negativePrompt: entry.negativePrompt,
      tool: "refine",
      model: entry.model,
      comfyUrl: data.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      sourceImageUrl: outputUrl,
      queueQualityProfile: profile,
      parentGalleryEntryId: entry.id,
      derivedKind: "refine",
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
      onStatus: options?.onStatus,
    });
  }

  return {
    ok: true,
    promptId: data.promptId,
    comfyUrl: data.comfyUrl ?? entry.comfyUrl,
  };
}

export type BulkUpscaleGalleryResult = {
  queued: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function summarizeBulkUpscaleLabel(entry: ComfyGalleryEntry): string {
  return entry.model ?? entry.tool ?? entry.id.slice(0, 8);
}

export function canUpscaleGalleryEntry(
  entry: Pick<ComfyGalleryEntry, "status" | "images" | "sourceImageUrl" | "comfyUrl">,
): boolean {
  if (entry.status !== "completed") {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

export async function bulkUpscaleGalleryEntries(
  entries: ComfyGalleryEntry[],
  qualityProfile: Extract<QueueQualityProfile, "final" | "max">,
  onStatus?: (message: string) => void,
): Promise<BulkUpscaleGalleryResult> {
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!canUpscaleGalleryEntry(entry)) {
      skipped += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: skipped (not completed or no output image)`);
      continue;
    }

    onStatus?.(`Upscaling ${index + 1}/${entries.length}…`);
    const result = await requeueUpscaleFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: undefined,
    });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: ${result.error ?? "queue failed"}`);
    }
  }

  const detail =
    errors.length > 0 ? ` · ${errors.slice(0, 3).join(" · ")}` : "";
  onStatus?.(
    `Bulk upscale finished · ${queued} queued · ${skipped} skipped · ${failed} failed${detail}`,
  );

  return { queued, failed, skipped, errors };
}

export function canRefineGalleryEntry(
  entry: Pick<ComfyGalleryEntry, "status" | "images" | "sourceImageUrl" | "comfyUrl">,
): boolean {
  return canUpscaleGalleryEntry(entry);
}

export async function bulkRefineGalleryEntries(
  entries: ComfyGalleryEntry[],
  qualityProfile: Extract<QueueQualityProfile, "final" | "max"> = "final",
  onStatus?: (message: string) => void,
): Promise<BulkUpscaleGalleryResult> {
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!canRefineGalleryEntry(entry)) {
      skipped += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: skipped (not completed or no output image)`);
      continue;
    }

    onStatus?.(`Refining ${index + 1}/${entries.length}…`);
    const result = await requeueRefineFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: undefined,
    });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: ${result.error ?? "queue failed"}`);
    }
  }

  const detail =
    errors.length > 0 ? ` · ${errors.slice(0, 3).join(" · ")}` : "";
  onStatus?.(
    `Bulk refine finished · ${queued} queued · ${skipped} skipped · ${failed} failed${detail}`,
  );

  return { queued, failed, skipped, errors };
}

export function requeueComfyJobFromEntry(
  entry: ComfyGalleryEntry,
  options?: Pick<RequeueComfyJobInput, "newSeed" | "onStatus" | "hints" | "qualityProfile">,
): Promise<RequeueComfyJobResult> {
  const urls = resolveRequeueImageUrlsFromEntry(entry);
  const isVariation = Boolean(options?.newSeed || options?.qualityProfile);
  return requeueComfyJob({
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    queueParams: entry.queueParams,
    sourceImageUrl: urls.sourceImageUrl,
    maskImageUrl: urls.maskImageUrl,
    storedQualityProfile: entry.queueQualityProfile,
    newSeed: options?.newSeed,
    hints: options?.hints,
    qualityProfile: options?.qualityProfile,
    parentGalleryEntryId: isVariation ? entry.id : undefined,
    derivedKind: isVariation ? "variation" : undefined,
    onStatus: options?.onStatus,
  });
}

export function requeueComfyJobFromHistory(
  entry: {
    id: string;
    prompt: string;
    model?: string;
    tool?: string;
    hints?: string;
    negativePrompt?: string;
    metadata?: Record<string, unknown>;
  },
  options?: Pick<RequeueComfyJobInput, "newSeed" | "onStatus" | "hints">,
): Promise<RequeueComfyJobResult> {
  const galleryEntry = findGalleryEntryForHistory(entry);
  if (galleryEntry) {
    return requeueComfyJobFromEntry(galleryEntry, {
      newSeed: options?.newSeed,
      onStatus: options?.onStatus,
      hints: options?.hints ?? entry.hints,
    });
  }

  return requeueComfyJob({
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    hints: options?.hints ?? entry.hints,
    newSeed: options?.newSeed,
    onStatus: options?.onStatus,
  });
}

export async function requeueComfyJob(
  input: RequeueComfyJobInput,
): Promise<RequeueComfyJobResult> {
  if (!input.prompt.trim()) {
    return { ok: false, error: "Prompt is required." };
  }

  input.onStatus?.("Queueing…");

  let negativePrompt = input.negativePrompt?.trim() || undefined;
  const model = (input.model ?? "qwen-image-2512") as ComfyImageModel;

  if (!negativePrompt) {
    negativePrompt = await resolveQueueNegativePrompt({
      model,
      hints: input.hints?.trim() || input.prompt.slice(0, 200),
    });
  }

  const baseParams = input.newSeed
    ? {
        ...input.queueParams,
        seed: String(Math.floor(Math.random() * 2 ** 32)),
      }
    : input.queueParams;

  if (input.sourceImageUrl?.trim() || input.maskImageUrl?.trim()) {
    input.onStatus?.("Refreshing queue images for ComfyUI…");
  }

  const refreshedParams = await refreshQueueImageParamsForRequeue({
    model,
    tool: input.tool,
    queueParams: baseParams,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
    forceInputImage: input.forceInputImage,
  });

  const params = resolveQueueParams({
    model,
    tool: input.tool,
    base: refreshedParams,
    qualityProfile:
      input.qualityProfile ?? input.storedQualityProfile ?? undefined,
  });

  const effectiveQualityProfile =
    input.qualityProfile ?? input.storedQualityProfile;
  const runtime = resolveRuntimeForQueue(model, input.tool);
  const comfyRuntime = runtime
    ? {
        ...runtime,
        queueQualityProfile:
          effectiveQualityProfile ?? runtime.queueQualityProfile,
      }
    : undefined;

  input.onStatus?.("Validating workflow…");
  const preflight = await runWorkflowPreflight({
    model,
    prompts: [input.prompt.trim()],
    negativePrompt,
    tool: input.tool,
    queueParams: params,
    hasInputImage: Boolean(params.inputImageFilename || input.sourceImageUrl?.trim()),
    hasMaskImage: Boolean(params.maskImageFilename || input.maskImageUrl?.trim()),
    qualityProfile: effectiveQualityProfile,
    comfy: comfyRuntime,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      error:
        preflight.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" · ") || "Workflow pre-flight failed.",
    };
  }

  const requeueImageIssues = auditRequeueImageReadiness({
    model,
    tool: input.tool,
    queueParams: params,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
    forceInputImage: input.forceInputImage,
  });
  const requeueImageError = requeueImageIssues.find((issue) => issue.severity === "error");
  if (requeueImageError) {
    return { ok: false, error: requeueImageError.message };
  }

  const response = await fetch("/api/comfyui", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt.trim(),
      negativePrompt,
      model,
      ...(params ? { params } : {}),
      ...(comfyRuntime ? { comfy: comfyRuntime } : {}),
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
    return {
      ok: false,
      error: data.error ?? "ComfyUI queue failed.",
      comfyUrl: data.comfyUrl,
    };
  }

  if (data.promptId) {
    registerComfyGalleryJob({
      promptId: data.promptId,
      prompt: input.prompt.trim(),
      negativePrompt,
      tool: input.tool,
      model: input.model,
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      sourceImageUrl: input.sourceImageUrl,
      maskImageUrl: input.maskImageUrl,
      queueQualityProfile: comfyRuntime?.queueQualityProfile,
      parentGalleryEntryId: input.parentGalleryEntryId,
      derivedKind: input.derivedKind,
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      onStatus: input.onStatus,
    });

    const warnMessages = requeueImageIssues
      .filter((issue) => issue.severity === "warn")
      .map((issue) => issue.message);
    if (warnMessages.length > 0) {
      input.onStatus?.(`Queued · ${warnMessages.join(" · ")}`);
    }
  }

  return {
    ok: true,
    promptId: data.promptId,
    comfyUrl: data.comfyUrl,
  };
}

export async function fetchWorkflowPreview(input: {
  prompt: string;
  negativePrompt?: string;
  newSeed?: boolean;
  params?: WorkflowParamValues;
  model?: ComfyImageModel | string;
  comfy?: ComfyUiRuntimeConfig;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
}): Promise<{
  ok?: boolean;
  error?: string;
  workflowSource?: string;
  replacements?: WorkflowPreviewResponse["replacements"];
  resolvedParams?: WorkflowPreviewResponse["resolvedParams"];
  snippets?: WorkflowPreviewResponse["snippets"];
  workflowJson?: string;
  truncated?: boolean;
  preflightIssues?: WorkflowPreviewResponse["preflightIssues"];
}> {
  const runtime =
    input.comfy ??
    (input.model
      ? resolveRuntimeForQueue(input.model as ComfyImageModel)
      : undefined) ??
    resolveComfyUiRuntime();
  const params: WorkflowParamValues | undefined = input.newSeed
    ? {
        ...input.params,
        seed: String(Math.floor(Math.random() * 2 ** 32)),
      }
    : input.params;
  const response = await fetch("/api/comfyui/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      params,
      model: input.model,
      hasInputImage: input.hasInputImage,
      hasMaskImage: input.hasMaskImage,
      ...(runtime ? { comfy: runtime } : {}),
    }),
  });

  const data = (await response.json()) as WorkflowPreviewResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Workflow preview failed.");
  }

  return data;
}

export async function requeueComfyJobs(
  inputs: RequeueComfyJobInput[],
  onStatus?: (message: string) => void,
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;

  for (const [index, input] of inputs.entries()) {
    onStatus?.(`Re-queueing ${index + 1}/${inputs.length}…`);
    const result = await requeueComfyJob({ ...input, onStatus: undefined });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
    }
  }

  onStatus?.(`Bulk re-queue finished · ${queued} queued · ${failed} failed`);
  return { queued, failed };
}
