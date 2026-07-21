"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import { avoidedTokensRequestBody } from "./avoided-tokens";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { injectLoraTriggers } from "./lora-prompt-injection";
import { loadActiveProjectId } from "./prompt-projects";
import { prepareQueuePrompts } from "./queue-prompt-prep";
import { resolveQueueParams } from "./queue-params-settings";
import { guardQueueQualityForVram } from "./vram-queue-guard";
import { maybeHoldMaxGenerateJobs } from "./held-max-queue";

export type CampaignStepResult = {
  index: number;
  prompt: string;
  queued: boolean;
  held?: boolean;
  promptId?: string;
  error?: string;
};

export async function runPromptCampaign(input: {
  model: ComfyImageModel | string;
  target: "random-scene" | "topics";
  count: number;
  genre?: string;
  topics?: string[];
  queueToComfyUi: boolean;
  hints?: string;
}): Promise<CampaignStepResult[]> {
  const model = input.model as ComfyImageModel;
  const count = Math.min(12, Math.max(1, input.count));
  const results: CampaignStepResult[] = [];
  const projectId = loadActiveProjectId();
  const baseRuntime = resolveRuntimeForQueue(model, "campaign");
  const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
  const runtime = vramGuard.runtime ?? baseRuntime;

  let prompts: string[] = [];

  if (input.target === "topics" && input.topics?.length) {
    const response = await fetch("/api/topics/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        topics: input.topics.slice(0, count),
        target: "generate",
        ...avoidedTokensRequestBody(),
      }),
    });
    const data = (await response.json()) as {
      results?: Array<{ prompt?: string; error?: string }>;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "Topics batch failed.");
    }
    prompts = (data.results ?? [])
      .map((entry) => entry.prompt?.trim())
      .filter(Boolean) as string[];
  } else {
    for (let index = 0; index < count; index += 1) {
      const response = await fetch("/api/random-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          genre: input.genre,
          includePeople: true,
          wildness: 65,
          ...avoidedTokensRequestBody(),
        }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok || !data.prompt?.trim()) {
        results.push({
          index,
          prompt: "",
          queued: false,
          error: data.error ?? "Random scene failed.",
        });
        continue;
      }
      prompts.push(data.prompt.trim());
    }
  }

  for (const [index, rawPrompt] of prompts.entries()) {
    const steered = input.queueToComfyUi
      ? await prepareQueuePrompts({
          model,
          positive: injectLoraTriggers(rawPrompt),
          hints: input.hints,
          tool: "campaign",
        })
      : {
          positive: injectLoraTriggers(rawPrompt),
          negative: undefined as string | undefined,
        };
    const prompt = steered.positive;
    if (!input.queueToComfyUi) {
      results.push({ index, prompt, queued: false });
      continue;
    }

    const params = resolveQueueParams({
      model: input.model,
      tool: "campaign",
      qualityProfile: vramGuard.profile,
    });
    const held = await maybeHoldMaxGenerateJobs({
      profile: vramGuard.profile,
      jobs: [
        {
          prompt,
          negativePrompt: steered.negative,
          model,
          tool: "campaign",
          params,
          comfy: runtime,
        },
      ],
    });
    if (held.held) {
      results.push({
        index,
        prompt,
        queued: false,
        held: true,
      });
      continue;
    }
    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negativePrompt: steered.negative,
        params,
        ...(runtime ? { comfy: runtime } : {}),
      }),
    });
    const data = (await response.json()) as { promptId?: string; comfyUrl?: string; error?: string };
    if (!response.ok || !data.promptId) {
      results.push({
        index,
        prompt,
        queued: false,
        error: data.error ?? "ComfyUI queue failed.",
      });
      continue;
    }

    registerComfyGalleryJob({
      promptId: data.promptId,
      prompt,
      negativePrompt: steered.negative,
      tool: "campaign",
      model,
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      projectId,
      queueQualityProfile: runtime.queueQualityProfile,
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
    });
    results.push({ index, prompt, queued: true, promptId: data.promptId });
  }

  return results;
}
