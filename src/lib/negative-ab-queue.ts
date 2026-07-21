"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import { injectLoraTriggers } from "./lora-prompt-injection";
import { modelUsesNegativePrompt } from "./prompt-pair";
import { guardQueueQualityForVram } from "./vram-queue-guard";
import { maybeHoldMaxGenerateJobs } from "./held-max-queue";

export async function queueNegativeAbTest(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativeA?: string;
  negativeB?: string;
  hints?: string;
  tool?: string;
  sharedSeed?: string;
}): Promise<{ queued: number; held: number; seed: string }> {
  const model = input.model as ComfyImageModel;
  const seed = input.sharedSeed ?? String(Math.floor(Math.random() * 2 ** 32));
  const baseRuntime = resolveRuntimeForQueue(model, input.tool ?? "negative-ab");
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;
  const params = resolveQueueParams({
    model,
    base: { seed },
    qualityProfile: vramGuard.profile,
  });
  const prompt = injectLoraTriggers(input.prompt.trim());

  let negativeA = input.negativeA?.trim();
  let negativeB = input.negativeB?.trim();

  if (modelUsesNegativePrompt(model)) {
    negativeA =
      negativeA ||
      (await resolveQueueNegativePrompt({
        model,
        hints: input.hints,
        tool: input.tool ?? "negative-ab",
      }));
    negativeB = negativeB ?? "";
  }

  let queued = 0;
  let held = 0;
  const variants: Array<{ label: string; negativePrompt?: string }> = [
    { label: "with-negative", negativePrompt: negativeA },
    { label: "without-negative", negativePrompt: undefined },
  ];

  if (negativeB !== undefined && negativeB !== negativeA) {
    variants.push({ label: "alt-negative", negativePrompt: negativeB });
  }

  for (const variant of variants) {
    const hold = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt: `${prompt} [${variant.label}]`,
          negativePrompt: variant.negativePrompt,
          model,
          tool: "negative-ab",
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
        prompt: `${prompt} [${variant.label}]`,
        negativePrompt: variant.negativePrompt,
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
      negativePrompt: variant.negativePrompt,
      tool: "negative-ab",
      model,
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      queueQualityProfile: runtime.queueQualityProfile,
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
    });
    queued += 1;
  }

  return { queued, held, seed };
}
