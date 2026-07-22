"use client";

import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { postComfyUiPrompt } from "./comfyui-queue-request";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { resolveQueueParams } from "./queue-params-settings";
import type { ComfyImageModel } from "./comfy-models/client";
import { galleryEntryPrimaryViewUrl } from "./comfyui-gallery";
import { guardQueueQualityForVram } from "./vram-queue-guard";
import { maybeHoldMaxGenerateJobs } from "./held-max-queue";
import { prepareQueuePrompts } from "./queue-prompt-prep";

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
    const prepared = await prepareQueuePrompts({
      model,
      positive: input.prompt.trim(),
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
          prompt: prepared.positive,
          negativePrompt: prepared.negative,
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

    const queued = await postComfyUiPrompt({
      prompt: prepared.positive,
      negativePrompt: prepared.negative,
      params,
      ...(runtime ? { comfy: runtime } : {}),
    });

    if (!queued.ok || !queued.promptId) {
      queued.releaseLiveSocket();
      return {
        model,
        prompt: input.prompt,
        error: queued.error ?? "Queue failed.",
      };
    }

    registerComfyGalleryJob({
      promptId: queued.promptId,
      prompt: prepared.positive,
      negativePrompt: prepared.negative,
      tool: "studio-compare",
      model,
      comfyUrl: queued.comfyUrl ?? "http://127.0.0.1:8188",
      clientId: queued.clientId,
      queueParams: params,
      queueQualityProfile: runtime.queueQualityProfile,
    });

    input.onStatus?.(`Polling ${model}…`);
    const entry = await scheduleComfyGalleryPoll(queued.promptId, {
      comfyUrl: queued.comfyUrl,
      clientId: queued.clientId,
      onStatus: input.onStatus,
    });
    queued.releaseLiveSocket();

    return {
      model,
      prompt: input.prompt,
      promptId: queued.promptId,
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
