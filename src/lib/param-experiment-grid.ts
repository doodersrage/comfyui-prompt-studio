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

export async function queueParamExperimentGrid(input: {
  prompt: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hints?: string;
  baseParams?: WorkflowParamValues;
  cfgValues?: string[];
  stepValues?: string[];
}): Promise<{ queued: number; cells: string[] }> {
  const model = input.model as ComfyImageModel;
  const runtime = resolveRuntimeForQueue(model, "param-grid");
  const prompt = injectLoraTriggers(input.prompt.trim());
  const base = input.baseParams ?? resolveQueueParams({ model });
  const cfgValues = (input.cfgValues ?? ["6", "7", "8", "9"]).slice(0, 4);
  const stepValues = (input.stepValues ?? ["18", "22", "26", "30"]).slice(0, 4);
  const projectId = loadActiveProjectId();

  let negativePrompt = input.negativePrompt?.trim();
  if (modelUsesNegativePrompt(model) && !negativePrompt) {
    negativePrompt = await resolveQueueNegativePrompt({
      model,
      hints: input.hints,
      tool: "param-grid",
    });
  }

  const cells: string[] = [];
  let queued = 0;

  for (const cfg of cfgValues) {
    for (const steps of stepValues) {
      const params: WorkflowParamValues = {
        ...base,
        cfg,
        steps,
        seed: String(Math.floor(Math.random() * 2 ** 32)),
      };
      cells.push(`cfg=${cfg} steps=${steps}`);

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
        tool: "param-grid",
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
  }

  return { queued, cells };
}
