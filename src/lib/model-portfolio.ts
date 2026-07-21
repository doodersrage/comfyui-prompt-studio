"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import { guardQueueQualityForVram } from "./vram-queue-guard";
import { maybeHoldMaxGenerateJobs } from "./held-max-queue";

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
    const negativePrompt = await resolveQueueNegativePrompt({
      model: item.model,
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
          prompt: item.prompt,
          negativePrompt,
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
    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: item.prompt,
        negativePrompt,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      }),
    });
    const data = (await response.json()) as { promptId?: string; comfyUrl?: string };
    if (response.ok && data.promptId) {
      registerComfyGalleryJob({
        promptId: data.promptId,
        prompt: item.prompt,
        negativePrompt,
        tool: input.tool ?? "portfolio",
        model: item.model,
        comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
        queueParams: params,
        queueQualityProfile: runtime.queueQualityProfile,
      });
      void scheduleComfyGalleryPoll(data.promptId, {
        comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      });
      queued += 1;
    }
  }
  return { queued, held };
}
