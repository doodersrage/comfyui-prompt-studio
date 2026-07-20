"use client";

import type { ComfyImageModel } from "./comfy-models";
import {
  registerComfyGalleryJob,
} from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import type { ComfyUiRuntimeConfig, WorkflowParamValues } from "./comfyui-config";
import { resolveRuntimeForModel } from "./comfyui-runtime-for-model";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";

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
  onStatus?: (message: string) => void;
};

export type RequeueComfyJobResult = {
  ok: boolean;
  promptId?: string;
  error?: string;
  comfyUrl?: string;
};

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

  const runtime = resolveRuntimeForModel(model);
  const params = resolveQueueParams({
    model,
    base: input.newSeed
      ? {
          ...input.queueParams,
          seed: String(Math.floor(Math.random() * 2 ** 32)),
        }
      : input.queueParams,
  });
  const response = await fetch("/api/comfyui", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt.trim(),
      negativePrompt,
      ...(params ? { params } : {}),
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
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      onStatus: input.onStatus,
    });
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
}): Promise<{
  ok?: boolean;
  error?: string;
  workflowSource?: string;
  replacements?: WorkflowPreviewResponse["replacements"];
  resolvedParams?: WorkflowPreviewResponse["resolvedParams"];
  snippets?: WorkflowPreviewResponse["snippets"];
  workflowJson?: string;
  truncated?: boolean;
}> {
  const runtime =
    input.comfy ??
    (input.model
      ? resolveRuntimeForModel(input.model as ComfyImageModel)
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
