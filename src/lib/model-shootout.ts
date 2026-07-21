"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { resolveQueueParams } from "./queue-params-settings";

export type ShootoutModel = {
  model: string;
  label: string;
};

export const DEFAULT_SHOOTOUT_MODELS: ShootoutModel[] = [
  { model: "sdxl", label: "SDXL" },
  { model: "flux-2-klein-4b-distilled", label: "FLUX Klein 4B Distilled" },
  { model: "flux-2-klein-9b-distilled", label: "FLUX Klein 9B Distilled" },
  { model: "sd1.5", label: "SD 1.5" },
];

export async function queueSameSeedShootout(input: {
  prompt: string;
  negativePrompt?: string;
  models: string[];
  seed: number;
}): Promise<{ queued: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;
  const seed = String(input.seed);

  for (const modelId of input.models) {
    try {
      const model = modelId as ComfyImageModel;
      const runtime = resolveRuntimeForQueue(model, "shootout");
      const params = resolveQueueParams({
        model,
        tool: "shootout",
        base: { seed },
      });
      const response = await fetch("/api/comfyui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          params,
          ...(runtime ? { comfy: runtime } : {}),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        promptId?: string;
        error?: string;
      };
      if (!response.ok || !data.promptId) {
        errors.push(data.error ?? `Failed for ${modelId}`);
        continue;
      }
      registerComfyGalleryJob({
        promptId: data.promptId,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        tool: "shootout",
        model: modelId,
        comfyUrl: (data as { comfyUrl?: string }).comfyUrl ?? "http://127.0.0.1:8188",
        queueParams: params,
        queueQualityProfile: runtime.queueQualityProfile,
      });
      void scheduleComfyGalleryPoll(data.promptId, {
        comfyUrl: (data as { comfyUrl?: string }).comfyUrl,
      });
      queued += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed for ${modelId}`);
    }
  }

  return { queued, errors };
}
