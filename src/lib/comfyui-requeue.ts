"use client";

import type { ComfyImageModel } from "./comfy-models";
import {
  registerComfyGalleryJob,
} from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import type { ComfyUiRuntimeConfig, WorkflowParamValues } from "./comfyui-config";
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

export function requeueComfyJobFromEntry(
  entry: ComfyGalleryEntry,
  options?: Pick<RequeueComfyJobInput, "newSeed" | "onStatus" | "hints" | "qualityProfile">,
): Promise<RequeueComfyJobResult> {
  const urls = resolveRequeueImageUrlsFromEntry(entry);
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
