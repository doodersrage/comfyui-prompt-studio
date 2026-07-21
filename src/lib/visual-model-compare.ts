"use client";

import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import type { ComfyImageModel } from "./comfy-models/client";
import { galleryEntryPrimaryViewUrl } from "./comfyui-gallery";
import { guardQueueQualityForVram } from "./vram-queue-guard";
import { maybeHoldMaxGenerateJobs } from "./held-max-queue";

export type VisualCompareResult = {
  model: string;
  prompt: string;
  promptId?: string;
  previewUrl?: string | null;
  held?: boolean;
  error?: string;
};

export async function runVisualModelCompare(input: {
  prompt: string;
  modelA: ComfyImageModel;
  modelB: ComfyImageModel;
  seed?: string;
  hints?: string;
  onStatus?: (message: string) => void;
}): Promise<{ a: VisualCompareResult; b: VisualCompareResult }> {
  const seed =
    input.seed?.trim() || String(Math.floor(Math.random() * 2 ** 32));

  async function queueOne(model: ComfyImageModel): Promise<VisualCompareResult> {
    const baseRuntime = resolveRuntimeForQueue(model, "studio-compare");
    const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
    const runtime = vramGuard.runtime ?? baseRuntime;
    const negativePrompt = await resolveQueueNegativePrompt({
      model,
      hints: input.hints ?? input.prompt.slice(0, 200),
      tool: "studio-compare",
    });

    const params = resolveQueueParams({
      model,
      tool: "studio-compare",
      base: { seed },
      qualityProfile: vramGuard.profile,
    });

    const held = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt: input.prompt.trim(),
          negativePrompt,
          model,
          tool: "studio-compare",
          params,
          comfy: runtime,
        },
      ],
    });
    if (held.held) {
      return {
        model,
        prompt: input.prompt,
        held: true,
      };
    }

    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt.trim(),
        negativePrompt,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      }),
    });

    const data = (await response.json()) as {
      ok?: boolean;
      promptId?: string;
      error?: string;
      comfyUrl?: string;
    };

    if (!response.ok || !data.promptId) {
      return {
        model,
        prompt: input.prompt,
        error: data.error ?? "Queue failed.",
      };
    }

    registerComfyGalleryJob({
      promptId: data.promptId,
      prompt: input.prompt.trim(),
      negativePrompt,
      tool: "studio-compare",
      model,
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      queueQualityProfile: runtime.queueQualityProfile,
    });

    input.onStatus?.(`Polling ${model}…`);
    const entry = await scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl,
      onStatus: input.onStatus,
    });

    return {
      model,
      prompt: input.prompt,
      promptId: data.promptId,
      previewUrl: entry ? galleryEntryPrimaryViewUrl(entry) : null,
      error: entry?.status === "error" ? entry.statusMessage : undefined,
    };
  }

  const [a, b] = await Promise.all([
    queueOne(input.modelA),
    queueOne(input.modelB),
  ]);

  return { a, b };
}
