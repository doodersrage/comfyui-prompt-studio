"use client";

import type { ComfyImageModel } from "./comfy-models";
import { avoidedTokensRequestBody } from "./avoided-tokens";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveRuntimeForModel } from "./comfyui-runtime-for-model";
import { injectLoraTriggers } from "./lora-prompt-injection";
import { loadActiveProjectId } from "./prompt-projects";
import { resolveQueueNegativePromptRaw } from "./queue-negative";
import { prepareNegativeForQueue, preparePositiveForQueue } from "./queue-prompt-prep";
import { resolveQueueParams } from "./queue-params-settings";
import { modelUsesNegativePrompt } from "./prompt-pair";

export type CampaignStepResult = {
  index: number;
  prompt: string;
  queued: boolean;
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
  const runtime = resolveRuntimeForModel(model);

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

  let negativePrompt: string | undefined;
  if (input.queueToComfyUi && modelUsesNegativePrompt(model)) {
    negativePrompt = await resolveQueueNegativePromptRaw({
      model,
      hints: input.hints,
      tool: "campaign",
    });
  }

  for (const [index, rawPrompt] of prompts.entries()) {
    const prompt = preparePositiveForQueue(injectLoraTriggers(rawPrompt));
    const steeredNegative = negativePrompt
      ? prepareNegativeForQueue(negativePrompt)
      : undefined;
    if (!input.queueToComfyUi) {
      results.push({ index, prompt, queued: false });
      continue;
    }

    const params = resolveQueueParams({ model: input.model });
    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negativePrompt: steeredNegative,
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
      negativePrompt: steeredNegative,
      tool: "campaign",
      model,
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
      queueParams: params,
      projectId,
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? "http://127.0.0.1:8188",
    });
    results.push({ index, prompt, queued: true, promptId: data.promptId });
  }

  return results;
}
