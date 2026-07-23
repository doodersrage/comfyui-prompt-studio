"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import {
  registerComfyGalleryJob,
} from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { postComfyUiPrompt } from "./comfyui-queue-request";
import { scheduleRefineAfterUpscaleComplete } from "./gallery-pending-actions";
import {
  resolveWorkflowGraphEnrichOptions,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from "./comfyui-config";
import { resolveQueueInputImageFilename } from "./queue-input-image";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";
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
  buildGalleryMoireCleanWorkflow,
  buildGalleryUpscaleWorkflow,
  resolveGalleryOutputImageUrl,
} from "./gallery-output-upscale";
import { isQwenLightningModel } from "./model-sampling-patch";
import { isQwenRapidAioModel } from "./model-denoise-defaults";
import {
  appendPortraitRefineNegative,
  buildGalleryRefineWorkflow,
  galleryRefineQueueParams,
} from "./gallery-output-refine";
import { findLibraryUpscaleWorkflowForModel } from "./workflow-library-upscale";
import { findLibraryFaceDetailerWorkflow } from "./workflow-library-face-detailer";
import { buildAutoFaceDetailerWorkflow } from "./facedetailer-workflow-patch";
import {
  faceDetailCustomTokens,
  faceDetailQueueParams,
  normalizeFaceDetailDenoise,
} from "./gallery-output-face-detail";
import { isUpscaleModelInstalled, resolveUpscaleModelFilename } from "./model-upscale-map";
import {
  fetchComfyObjectInfoCached,
  fetchComfyObjectInfoNodeTypesCached,
} from "./comfyui-object-info-cache";
import { loadSettingsCache } from "./settings-cache";
import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from "./comfyui-settings";
import {
  fetchComfyQueueIdle,
  holdMaxGalleryEnhance,
  holdMaxGenerateJob,
  shouldHoldMaxUntilIdle,
} from "./held-max-queue";
import {
  fetchComfyVramSnapshot,
  guardQueueQualityForVram,
  maybeDowngradeMaxForVram,
} from "./vram-queue-guard";
import {
  canMoireCleanGalleryEntry,
  canRefineGalleryEntry,
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
} from "./gallery-entry-actions";

export {
  canFaceDetailGalleryEntry,
  canMoireCleanGalleryEntry,
  canRefineGalleryEntry,
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntryIsFinalToMaxBump,
  galleryEntrySupportsFaceDetail,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
  galleryEntrySupportsUpscale,
} from "./gallery-entry-actions";

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
  /** Force a specific ComfyUI endpoint for this re-queue (e.g. pool failover on OOM). */
  comfyUrlOverride?: string;
  /**
   * Exact API workflow graph (e.g. from PNG/Comfy history). When set, queues with
   * directWorkflowPatching instead of rebuilding from the library template.
   */
  workflowJson?: string;
  onStatus?: (message: string) => void;
};

export type RequeueComfyJobResult = {
  ok: boolean;
  promptId?: string;
  error?: string;
  comfyUrl?: string;
  /** Max job parked until ComfyUI queue is idle. */
  held?: boolean;
  vramDowngraded?: boolean;
};

async function resolveEnhanceQualityProfile(input: {
  entry: Pick<ComfyGalleryEntry, "id" | "model" | "tool">;
  qualityProfile: Extract<QueueQualityProfile, "final" | "max">;
  kind: "upscale" | "moire" | "refine";
  force?: boolean;
  onStatus?: (message: string) => void;
}): Promise<
  | { action: "hold" }
  | {
      action: "queue";
      qualityProfile: Extract<QueueQualityProfile, "final" | "max">;
      vramDowngraded: boolean;
    }
> {
  let qualityProfile = input.qualityProfile;
  if (qualityProfile === "max" && !input.force) {
    const shared = loadSettingsCache().shared;
    if (shared.holdMaxUntilIdle) {
      const idle = await fetchComfyQueueIdle();
      if (!idle) {
        holdMaxGalleryEnhance({
          entry: input.entry,
          kind: input.kind,
          qualityProfile: "max",
        });
        input.onStatus?.(
          "Max held until ComfyUI queue is idle (Queue → Orchestration).",
        );
        return { action: "hold" };
      }
    }
  }
  // Always re-check VRAM for Max (including force flush) — hold bypass stays force-only.
  if (qualityProfile === "max") {
    const vram = await fetchComfyVramSnapshot();
    const guard = maybeDowngradeMaxForVram(qualityProfile, vram);
    if (guard.downgraded) {
      qualityProfile = "final";
      input.onStatus?.("Max → Final (VRAM) — free VRAM under 6 GB.");
    }
    return {
      action: "queue",
      qualityProfile,
      vramDowngraded: guard.downgraded,
    };
  }
  return { action: "queue", qualityProfile, vramDowngraded: false };
}

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
    /** Bypass keeper skip (manual force re-upscale). */
    force?: boolean;
  },
): Promise<RequeueComfyJobResult> {
  const model = (entry.model ?? "qwen-image-2512") as ComfyImageModel;

  const resolved = await resolveEnhanceQualityProfile({
    entry,
    qualityProfile: options.qualityProfile,
    kind: "upscale",
    force: options.force,
    onStatus: options.onStatus,
  });
  if (resolved.action === "hold") {
    return { ok: true, held: true };
  }
  const qualityProfile = resolved.qualityProfile;
  const vramDowngraded = resolved.vramDowngraded;

  if (
    !options.force &&
    galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
  ) {
    return {
      ok: false,
      error:
        "Already Final/Max enriched — skip re-upscale (use Draft source or a new seed).",
    };
  }

  // Rapid AIO: Lanczos/neural re-amplifies moiré — use the polish chain instead.
  if (isQwenRapidAioModel(model)) {
    options.onStatus?.(
      `Rapid AIO skips upscale — queueing moiré clean (${qualityProfile})…`,
    );
    return requeueMoireCleanFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: options.onStatus,
      force: options.force,
    });
  }

  if (isQwenLightningModel(model)) {
    return {
      ok: false,
      error:
        "Upscale is disabled for Lightning (pass-through only). Use Re-queue (new seed) with Final/Max quality instead.",
    };
  }

  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: "No gallery output image available to upscale." };
  }

  options.onStatus?.("Uploading gallery output…");

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
  const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings(), {
    activeOnly: true,
  });
  const isLightning = isQwenLightningModel(model);
  const mappedUpscale =
    !isLightning &&
    (qualityProfile === "final" || qualityProfile === "max")
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
          qualityProfile,
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
      queueQualityProfile: qualityProfile,
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

    const queued = await postComfyUiPrompt({
      prompt: entry.prompt.trim() || "upscale",
      negativePrompt: entry.negativePrompt,
      model,
      params,
      comfy: runtime,
    });

    if (!queued.ok || !queued.promptId) {
      queued.releaseLiveSocket();
      return {
        ok: false,
        error: queued.error ?? "ComfyUI upscale queue failed.",
        comfyUrl: queued.comfyUrl,
      };
    }

    registerComfyGalleryJob({
      promptId: queued.promptId,
      prompt: entry.prompt.trim() || "upscale",
      negativePrompt: entry.negativePrompt,
      tool: entry.tool,
      model: entry.model,
      comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
      clientId: queued.clientId,
      queueParams: { inputImageFilename },
      sourceImageUrl: outputUrl,
      queueQualityProfile: qualityProfile,
      parentGalleryEntryId: entry.id,
      derivedKind: "upscale",
      historyId: entry.historyId,
    });
    if (options.refineAfterComplete && !isLightning) {
      scheduleRefineAfterUpscaleComplete(queued.promptId, options.refineAfterComplete);
    }
    void scheduleComfyGalleryPoll(queued.promptId, {
      comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
      clientId: queued.clientId,
      onStatus: options.onStatus,
    });
    queued.releaseLiveSocket();

    return {
      ok: true,
      promptId: queued.promptId,
      comfyUrl: queued.comfyUrl ?? entry.comfyUrl,
      vramDowngraded,
    };
  };

  let result = await queueUpscale(upscaleModelFilename);
  if (!result.ok && upscaleModelFilename) {
    options.onStatus?.(
      `Neural upscale failed (${result.error ?? "queue error"}) — retrying with Lanczos…`,
    );
    result = await queueUpscale(undefined);
  }

  return { ...result, vramDowngraded };
}

export async function requeueMoireCleanFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    qualityProfile?: Extract<QueueQualityProfile, "final" | "max">;
    onStatus?: (message: string) => void;
    force?: boolean;
  },
): Promise<RequeueComfyJobResult> {
  const requested = options?.qualityProfile ?? "final";
  const resolved = await resolveEnhanceQualityProfile({
    entry,
    qualityProfile: requested,
    kind: "moire",
    force: options?.force,
    onStatus: options?.onStatus,
  });
  if (resolved.action === "hold") {
    return { ok: true, held: true };
  }
  const profile = resolved.qualityProfile;
  if (
    !options?.force &&
    galleryEntryAlreadyEnrichedForUpscale(entry, profile)
  ) {
    return {
      ok: false,
      error:
        "Already Final/Max polished — skip moiré re-clean (use Draft source or a new seed).",
    };
  }

  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: "No gallery output image available to clean." };
  }

  options?.onStatus?.("Uploading gallery output…");

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

  const qualityProfile = profile;
  const workflow = buildGalleryMoireCleanWorkflow(qualityProfile);
  const baseRuntime = resolveRuntimeForQueue(model, entry.tool);

  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: false,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    queueQualityProfile: qualityProfile,
  };

  options?.onStatus?.(
    qualityProfile === "max"
      ? "Queueing moiré clean (Max: blur → bicubic → Lanczos)…"
      : "Queueing moiré clean (Final: soft blur only)…",
  );

  const queued = await postComfyUiPrompt({
    prompt: entry.prompt.trim() || "moire clean",
    negativePrompt: entry.negativePrompt,
    model,
    params: { inputImageFilename },
    comfy: runtime,
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? "ComfyUI moiré-clean queue failed.",
      comfyUrl: queued.comfyUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: entry.prompt.trim() || "moire clean",
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    queueParams: { inputImageFilename },
    sourceImageUrl: outputUrl,
    queueQualityProfile: qualityProfile,
    parentGalleryEntryId: entry.id,
    derivedKind: "moire-clean",
    historyId: entry.historyId,
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl,
    vramDowngraded: resolved.vramDowngraded,
  };
}

export async function requeueRefineFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    qualityProfile?: Extract<QueueQualityProfile, "final" | "max">;
    onStatus?: (message: string) => void;
    force?: boolean;
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

  const requested = options?.qualityProfile ?? "final";
  const resolved = await resolveEnhanceQualityProfile({
    entry,
    qualityProfile: requested,
    kind: "refine",
    force: options?.force,
    onStatus: options?.onStatus,
  });
  if (resolved.action === "hold") {
    return { ok: true, held: true };
  }
  const profile = resolved.qualityProfile;

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

  const workflow = buildGalleryRefineWorkflow(model);
  const baseRuntime = resolveRuntimeForQueue(model, "refine");
  const refineParams = galleryRefineQueueParams({
    inputImageFilename,
    profile,
    prompt: entry.prompt,
    queueParams: entry.queueParams,
  });
  const params = {
    ...resolveQueueParams({
      model,
      tool: "refine",
      qualityProfile: profile,
      inputImageFilename,
      base: refineParams,
    }),
    ...refineParams,
  };

  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: true,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    queueQualityProfile: profile,
  };

  options?.onStatus?.(
    resolved.vramDowngraded
      ? "Max → Final (VRAM) · queueing low-denoise refine…"
      : "Queueing low-denoise refine…",
  );

  const refineNegative = appendPortraitRefineNegative(entry.negativePrompt, entry.prompt);

  const queued = await postComfyUiPrompt({
    prompt: entry.prompt.trim() || "refine",
    negativePrompt: refineNegative,
    model,
    params,
    comfy: runtime,
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? "ComfyUI refine queue failed.",
      comfyUrl: queued.comfyUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: entry.prompt.trim() || "refine",
    negativePrompt: entry.negativePrompt,
    tool: "refine",
    model: entry.model,
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    queueParams: params,
    sourceImageUrl: outputUrl,
    queueQualityProfile: profile,
    parentGalleryEntryId: entry.id,
    derivedKind: "refine",
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl,
    vramDowngraded: resolved.vramDowngraded,
  };
}

/**
 * Requeues the gallery output through a face-detailer / ReActor-style workflow.
 *
 * Requires a dedicated library workflow (Settings → workflow library, pinned
 * via `modelWorkflowMap.faceDetailer` or auto-detected by name/node type)
 * containing {{FACE_DETAIL_IMAGE}} / {{FACE_DETAIL_DENOISE}}. Refuses when
 * none is available — never queues the LoadImage→SaveImage pass-through stub.
 */
export async function requeueFaceDetailFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: {
    denoise?: number;
    onStatus?: (message: string) => void;
  },
): Promise<RequeueComfyJobResult> {
  const outputUrl = resolveGalleryOutputImageUrl(entry);
  if (!outputUrl) {
    return { ok: false, error: "No gallery output image available to face-detail." };
  }

  const model = (entry.model ?? "qwen-image-2512") as ComfyImageModel;
  if (isQwenLightningModel(model)) {
    return {
      ok: false,
      error:
        "Face detail is disabled for Lightning (img2img pass-through only) — use Refine or Upscale instead.",
    };
  }

  const libraryWorkflow = findLibraryFaceDetailerWorkflow();
  let workflowJson = libraryWorkflow?.workflowJson;
  const workflowFileId = libraryWorkflow?.id;

  if (!workflowJson) {
    const objectInfo = await fetchComfyObjectInfoNodeTypesCached().catch(() => null);
    const auto = buildAutoFaceDetailerWorkflow({
      availableNodeTypes: objectInfo ?? undefined,
      model,
    });
    if (!auto.inserted) {
      return {
        ok: false,
        error:
          auto.reason ??
          "No FaceDetailer/ReActor workflow found. Import one with {{FACE_DETAIL_IMAGE}}, pin faceDetailer=<workflowId> in Settings, or install Impact Pack FaceDetailer for auto-insert.",
      };
    }
    workflowJson = JSON.stringify(auto.workflow);
  }

  options?.onStatus?.("Uploading gallery output…");

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
  const denoise = normalizeFaceDetailDenoise(
    options?.denoise ?? shared.faceDetailerDenoise,
  );

  const workflow = JSON.parse(workflowJson) as Record<string, unknown>;

  const faceDetailParams = faceDetailQueueParams({
    inputImageFilename,
    denoise,
    queueParams: entry.queueParams,
  });
  const baseRuntime = resolveRuntimeForQueue(model, "face-detail");
  const runtime: ComfyUiRuntimeConfig = {
    ...baseRuntime,
    workflowJson: JSON.stringify(workflow),
    workflowQueueOptimize: true,
    workflowGraphEnrich: false,
    directWorkflowPatching: true,
    customTokens: faceDetailCustomTokens({ inputImageFilename, denoise }),
    workflowFileId,
  };

  options?.onStatus?.(
    workflowFileId
      ? `Queueing library face-detail workflow…`
      : "Queueing auto FaceDetailer graph…",
  );

  const queued = await postComfyUiPrompt({
    prompt: entry.prompt.trim() || "face detail",
    negativePrompt: entry.negativePrompt,
    model,
    params: faceDetailParams,
    comfy: runtime,
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? "ComfyUI face-detail queue failed.",
      comfyUrl: queued.comfyUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: entry.prompt.trim() || "face detail",
    negativePrompt: entry.negativePrompt,
    tool: entry.tool,
    model: entry.model,
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    queueParams: faceDetailParams,
    sourceImageUrl: outputUrl,
    queueQualityProfile: entry.queueQualityProfile,
    parentGalleryEntryId: entry.id,
    derivedKind: "face-detail",
    historyId: entry.historyId,
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    onStatus: options?.onStatus,
  });
  queued.releaseLiveSocket();

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.comfyUrl ?? entry.comfyUrl,
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
    if (!canUpscaleGalleryEntry(entry, qualityProfile)) {
      skipped += 1;
      const reason = galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
        ? "already Final/Max enriched"
        : "not completed or no output image";
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: skipped (${reason})`);
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

export async function bulkMoireCleanGalleryEntries(
  entries: ComfyGalleryEntry[],
  qualityProfile: Extract<QueueQualityProfile, "final" | "max"> = "final",
  onStatus?: (message: string) => void,
): Promise<BulkUpscaleGalleryResult> {
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (!canMoireCleanGalleryEntry(entry, qualityProfile)) {
      skipped += 1;
      const reason = galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
        ? "already Final/Max polished"
        : "not completed or no output image";
      errors.push(`${summarizeBulkUpscaleLabel(entry)}: skipped (${reason})`);
      continue;
    }

    onStatus?.(`Moiré clean ${index + 1}/${entries.length}…`);
    const result = await requeueMoireCleanFromGalleryEntry(entry, {
      qualityProfile,
      onStatus: undefined,
    });
    if (result.ok) {
      queued += 1;
    } else {
      failed += 1;
      errors.push(
        `${summarizeBulkUpscaleLabel(entry)}: ${result.error ?? "queue failed"}`,
      );
    }
  }

  const detail =
    errors.length > 0 ? ` · ${errors.slice(0, 3).join(" · ")}` : "";
  onStatus?.(
    `Bulk moiré clean finished · ${queued} queued · ${skipped} skipped · ${failed} failed${detail}`,
  );

  return { queued, failed, skipped, errors };
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
  options?: Pick<
    RequeueComfyJobInput,
    "newSeed" | "onStatus" | "hints" | "qualityProfile" | "comfyUrlOverride"
  >,
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
    comfyUrlOverride: options?.comfyUrlOverride,
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

  const requestedProfile =
    input.qualityProfile ?? input.storedQualityProfile ?? undefined;
  const baseRuntime = resolveRuntimeForQueue(model, input.tool);
  const withRequested = baseRuntime
    ? {
        ...baseRuntime,
        queueQualityProfile:
          requestedProfile ?? baseRuntime.queueQualityProfile,
      }
    : undefined;
  const vramGuard = await guardQueueQualityForVram({
    profile: requestedProfile ?? withRequested?.queueQualityProfile,
    runtime: withRequested,
  });
  const effectiveQualityProfile = vramGuard.profile;
  const comfyRuntime = input.comfyUrlOverride?.trim()
    ? { ...vramGuard.runtime, apiUrl: input.comfyUrlOverride.trim() }
    : vramGuard.runtime;
  if (vramGuard.downgraded) {
    input.onStatus?.("Max → Final (VRAM) — free VRAM under 6 GB.");
  }

  const params = resolveQueueParams({
    model,
    tool: input.tool,
    base: refreshedParams,
    qualityProfile: effectiveQualityProfile,
  });

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

  if (
    effectiveQualityProfile === "max" &&
    (await shouldHoldMaxUntilIdle())
  ) {
    holdMaxGenerateJob({
      prompt: input.prompt.trim(),
      negativePrompt,
      model: String(model),
      tool: input.tool,
      params,
      comfy: comfyRuntime,
      qualityProfile: "max",
    });
    input.onStatus?.(
      "Max held until ComfyUI queue is idle (Queue → Orchestration).",
    );
    return { ok: true, held: true, vramDowngraded: vramGuard.downgraded };
  }

  const workflowJson = input.workflowJson?.trim();
  const comfyPayload = workflowJson
    ? {
        ...comfyRuntime,
        workflowJson,
        directWorkflowPatching: true,
        workflowQueueOptimize: true,
      }
    : comfyRuntime;

  const queued = await postComfyUiPrompt({
    prompt: input.prompt.trim(),
    negativePrompt,
    model,
    ...(params ? { params } : {}),
    ...(comfyPayload ? { comfy: comfyPayload } : {}),
  });

  if (!queued.ok || !queued.promptId) {
    queued.releaseLiveSocket();
    return {
      ok: false,
      error: queued.error ?? "ComfyUI queue failed.",
      comfyUrl: queued.comfyUrl,
    };
  }

  registerComfyGalleryJob({
    promptId: queued.promptId,
    prompt: input.prompt.trim(),
    negativePrompt,
    tool: input.tool,
    model: input.model,
    comfyUrl: queued.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    queueParams: params,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
    queueQualityProfile: comfyRuntime?.queueQualityProfile,
    parentGalleryEntryId: input.parentGalleryEntryId,
    derivedKind: input.derivedKind,
  });
  void scheduleComfyGalleryPoll(queued.promptId, {
    comfyUrl: queued.comfyUrl ?? "http://127.0.0.1:8188",
    clientId: queued.clientId,
    onStatus: input.onStatus,
  });
  queued.releaseLiveSocket();

  const warnMessages = requeueImageIssues
    .filter((issue) => issue.severity === "warn")
    .map((issue) => issue.message);
  if (warnMessages.length > 0) {
    input.onStatus?.(`Queued · ${warnMessages.join(" · ")}`);
  }

  return {
    ok: true,
    promptId: queued.promptId,
    comfyUrl: queued.comfyUrl,
    vramDowngraded: vramGuard.downgraded,
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
