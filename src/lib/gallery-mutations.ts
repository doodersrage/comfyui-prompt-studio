"use client";

import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { resolveRuntimeForModel } from "./comfyui-runtime-for-model";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import { injectLoraTriggers } from "./lora-prompt-injection";

export type MutationKind = "variation" | "location" | "wardrobe" | "wildness";

export function buildMutatedPrompt(
  basePrompt: string,
  kind: MutationKind,
  value?: string,
): string {
  const prompt = basePrompt.trim();
  switch (kind) {
    case "location":
      return value?.trim()
        ? `${prompt}. Relocate scene to ${value.trim()} while preserving subject and action.`
        : `${prompt}. Change to a contrasting outdoor location while preserving subject identity.`;
    case "wardrobe":
      return value?.trim()
        ? `${prompt}. Change outfit to ${value.trim()} while keeping pose and scene.`
        : `${prompt}. Refresh wardrobe with a contrasting but scene-appropriate outfit.`;
    case "wildness":
      return `${prompt}. Push composition and lighting toward a bolder, more dynamic interpretation.`;
    case "variation":
    default:
      return `${prompt}. Subtle variation: adjust camera angle, expression, or micro-composition while preserving core scene intent.`;
  }
}

export async function queueMutatedGalleryJobs(input: {
  entry: ComfyGalleryEntry;
  kinds: MutationKind[];
  values?: Partial<Record<MutationKind, string>>;
  count?: number;
}): Promise<number> {
  const count = Math.min(6, Math.max(1, input.count ?? input.kinds.length));
  const model = (input.entry.model ?? "qwen-image-2512") as Parameters<
    typeof resolveRuntimeForModel
  >[0];
  const runtime = resolveRuntimeForModel(model);
  const negativePrompt =
    input.entry.negativePrompt?.trim() ||
    (await resolveQueueNegativePrompt({
      model,
      hints: input.entry.prompt.slice(0, 200),
      tool: input.entry.tool ?? "gallery-mutate",
    }));

  let queued = 0;
  for (let index = 0; index < count; index += 1) {
    const kind = input.kinds[index % input.kinds.length] ?? "variation";
    const prompt = injectLoraTriggers(
      buildMutatedPrompt(
        input.entry.prompt,
        kind,
        input.values?.[kind],
      ),
    );
    const params = resolveQueueParams({
      model: input.entry.model,
      base: {
        ...input.entry.queueParams,
        seed: String(Math.floor(Math.random() * 2 ** 32) + index),
      },
    });

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

    const data = (await response.json()) as {
      promptId?: string;
      comfyUrl?: string;
    };

    if (!response.ok || !data.promptId) {
      continue;
    }

    registerComfyGalleryJob({
      promptId: data.promptId,
      prompt,
      negativePrompt,
      tool: "gallery-mutate",
      model,
      comfyUrl: data.comfyUrl ?? input.entry.comfyUrl,
      queueParams: params,
      historyId: input.entry.historyId,
      projectId: input.entry.projectId,
    });
    void scheduleComfyGalleryPoll(data.promptId, {
      comfyUrl: data.comfyUrl ?? input.entry.comfyUrl,
    });
    queued += 1;
  }

  return queued;
}
