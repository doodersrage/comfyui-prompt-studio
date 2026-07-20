"use client";

import type { ComfyImageModel } from "./comfy-models";
import type { WorkflowParamValues } from "./comfyui-config";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { registerComfyGalleryJob } from "./comfyui-gallery-client";
import { scheduleComfyGalleryPoll } from "./comfyui-gallery-poller";
import { injectLoraTriggers } from "./lora-prompt-injection";
import { loadActiveProjectId } from "./prompt-projects";
import { resolveQueueNegativePrompt } from "./queue-negative";
import { resolveQueueParams } from "./queue-params-settings";
import { modelUsesNegativePrompt } from "./prompt-pair";

export type ParamExperimentAxis = "seed" | "cfg" | "steps" | "width";

export async function queueParamExperiment(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hints?: string;
  baseParams?: WorkflowParamValues;
  axis?: ParamExperimentAxis;
  count?: number;
  values?: string[];
}): Promise<{ queued: number; labels: string[] }> {
  const model = input.model as ComfyImageModel;
  const axis = input.axis ?? "cfg";
  const count = Math.min(8, Math.max(2, input.count ?? 4));
  const runtime = resolveRuntimeForQueue(model, "param-experiment");
  const prompt = injectLoraTriggers(input.prompt.trim());
  const base = input.baseParams ?? resolveQueueParams({ model });
  const projectId = loadActiveProjectId();

  let negativePrompt = input.negativePrompt?.trim();
  if (modelUsesNegativePrompt(model) && !negativePrompt) {
    negativePrompt = await resolveQueueNegativePrompt({
      model,
      hints: input.hints,
      tool: "param-experiment",
    });
  }

  const defaultValues: Record<ParamExperimentAxis, string[]> = {
    seed: Array.from({ length: count }, (_, index) =>
      String(Math.floor(Math.random() * 2 ** 32) + index),
    ),
    cfg: ["5", "6", "7", "8", "9", "10", "11", "12"].slice(0, count),
    steps: ["16", "20", "24", "28", "32", "36", "40", "44"].slice(0, count),
    width: ["768", "896", "1024", "1152", "1280", "1408", "1536", "1664"].slice(
      0,
      count,
    ),
  };

  const values = (input.values?.length ? input.values : defaultValues[axis]).slice(
    0,
    count,
  );
  const labels: string[] = [];
  let queued = 0;

  for (const value of values) {
    const params: WorkflowParamValues = {
      ...base,
      seed:
        axis === "seed"
          ? value
          : base.seed ?? String(Math.floor(Math.random() * 2 ** 32)),
      cfg: axis === "cfg" ? value : base.cfg,
      steps: axis === "steps" ? value : base.steps,
      width: axis === "width" ? value : base.width,
    };
    labels.push(`${axis}=${value}`);

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
      tool: "param-experiment",
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

  return { queued, labels };
}
