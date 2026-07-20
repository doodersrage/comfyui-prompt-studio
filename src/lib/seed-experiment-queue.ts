"use client";

import type { ComfyImageModel } from "./comfy-models";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { loadActiveProjectId } from "./prompt-projects";
import { injectLoraTriggers } from "./lora-prompt-injection";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import { modelUsesNegativePrompt } from "./prompt-pair";

export async function queueSeedExperiment(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hints?: string;
  tool?: string;
  count?: number;
  sharedSeed?: string;
}): Promise<{ queued: number; seeds: string[] }> {
  const model = input.model as ComfyImageModel;
  const count = Math.min(12, Math.max(2, input.count ?? 4));
  const runtime = resolveRuntimeForQueue(model, input.tool ?? "seed-experiment");
  const prompt = injectLoraTriggers(input.prompt.trim());

  let negativePrompt = input.negativePrompt?.trim();
  if (modelUsesNegativePrompt(model) && !negativePrompt) {
    negativePrompt = await resolveQueueNegativePrompt({
      model,
      hints: input.hints,
      tool: input.tool ?? "seed-experiment",
    });
  }

  const seeds: string[] = [];
  let queued = 0;
  const projectId = loadActiveProjectId();

  for (let index = 0; index < count; index += 1) {
    const seed =
      input.sharedSeed && index === 0
        ? input.sharedSeed
        : String(Math.floor(Math.random() * 2 ** 32) + index);
    seeds.push(seed);
    const params = resolveQueueParams({ model, base: { seed } });

    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negativePrompt,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      }),
    });

    const data = (await response.json()) as { promptId?: string; comfyUrl?: string };
    if (!response.ok || !data.promptId) {
      continue;
    }

    registerComfyGalleryJob({
      promptId: data.promptId,
      prompt,
      negativePrompt,
      tool: "seed-experiment",
      model,
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      projectId,
      queueQualityProfile: runtime.queueQualityProfile,
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
    });
    queued += 1;
  }

  return { queued, seeds };
}
