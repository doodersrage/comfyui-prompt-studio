"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { postComfyUiPrompt } from "./comfyui-queue-request";
import { resolveQueueParams } from "./queue-params-settings";
import { guardQueueQualityForVram } from "./vram-queue-guard";
import { maybeHoldMaxGenerateJobs } from "./held-max-queue";
import { prepareQueuePrompts } from "./queue-prompt-prep";

export type ModelPortfolioItem = {
  model: ComfyImageModel;
  prompt: string;
  error?: string;
};

export async function generateModelPortfolio(input: {
  draft: string;
  models: ComfyImageModel[];
  detail?: string;
}): Promise<ModelPortfolioItem[]> {
  const results: ModelPortfolioItem[] = [];

  for (const model of input.models) {
    try {
      const response = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: input.draft.trim(),
          mode: "positive",
          model,
          detail: input.detail ?? "balanced",
          smartFormat: true,
        }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok || !data.prompt?.trim()) {
        results.push({
          model,
          prompt: "",
          error: data.error ?? "Format failed.",
        });
        continue;
      }
      results.push({ model, prompt: data.prompt.trim() });
    } catch (err) {
      results.push({
        model,
        prompt: "",
        error: err instanceof Error ? err.message : "Format failed.",
      });
    }
  }

  return results;
}

export async function queueModelPortfolio(input: {
  items: ModelPortfolioItem[];
  hints?: string;
  tool?: string;
}): Promise<{ queued: number; held: number }> {
  let queued = 0;
  let held = 0;
  for (const item of input.items) {
    if (!item.prompt.trim()) {
      continue;
    }
    const baseRuntime = resolveRuntimeForQueue(item.model, input.tool ?? "portfolio");
    const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
    const runtime = vramGuard.runtime ?? baseRuntime;
    const prepared = await prepareQueuePrompts({
      model: item.model,
      positive: item.prompt,
      hints: input.hints,
      tool: input.tool ?? "portfolio",
    });
    const params = resolveQueueParams({
      model: item.model,
      tool: input.tool ?? "portfolio",
      qualityProfile: vramGuard.profile,
    });
    const hold = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt: prepared.positive,
          negativePrompt: prepared.negative,
          model: item.model,
          tool: input.tool ?? "portfolio",
          params,
          comfy: runtime,
        },
      ],
    });
    if (hold.held) {
      held += 1;
      continue;
    }
    const queuedJob = await postComfyUiPrompt({
      prompt: prepared.positive,
      negativePrompt: prepared.negative,
      params,
      ...(runtime ? { comfy: runtime } : {}),
    });
    if (!queuedJob.ok || !queuedJob.promptId) {
      queuedJob.releaseLiveSocket();
      continue;
    }
    registerComfyGalleryJob({
      promptId: queuedJob.promptId,
      prompt: prepared.positive,
      negativePrompt: prepared.negative,
      tool: input.tool ?? "portfolio",
      model: item.model,
      comfyUrl: queuedJob.comfyUrl ?? "http://127.0.0.1:8188",
      clientId: queuedJob.clientId,
      queueParams: params,
      queueQualityProfile: runtime.queueQualityProfile,
    });
    void scheduleComfyGalleryPoll(queuedJob.promptId, {
      comfyUrl: queuedJob.comfyUrl ?? "http://127.0.0.1:8188",
      clientId: queuedJob.clientId,
    });
    queuedJob.releaseLiveSocket();
    queued += 1;
  }
  return { queued, held };
}
