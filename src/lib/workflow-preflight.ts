"use client";

import { modelUsesNegativePrompt } from "./prompt-pair";
import type { ComfyImageModel } from "./comfy-models";
import { resolveRuntimeForModel } from "./comfyui-runtime-for-model";
import { fetchWorkflowPreview } from "./comfyui-requeue";

export type WorkflowPreflightIssue = {
  severity: "error" | "warn";
  message: string;
};

export type WorkflowPreflightResult = {
  ok: boolean;
  issues: WorkflowPreflightIssue[];
};

export async function runWorkflowPreflight(input: {
  model: ComfyImageModel | string;
  prompts: string[];
  negativePrompt?: string;
}): Promise<WorkflowPreflightResult> {
  const issues: WorkflowPreflightIssue[] = [];
  const runtime = resolveRuntimeForModel(input.model);

  if (!runtime?.workflowJson && !runtime?.workflowFileId) {
    issues.push({
      severity: "warn",
      message: "No workflow JSON configured — server/env fallback will be used.",
    });
  }

  if (modelUsesNegativePrompt(input.model) && !input.negativePrompt?.trim()) {
    issues.push({
      severity: "warn",
      message: "SD-family model queued without a negative prompt.",
    });
  }

  const samplePrompt = input.prompts.find((entry) => entry.trim())?.trim();
  if (!samplePrompt) {
    issues.push({ severity: "error", message: "No prompts to queue." });
    return { ok: false, issues };
  }

  try {
    const preview = await fetchWorkflowPreview({
      prompt: samplePrompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
    });
    if (!preview.ok) {
      issues.push({
        severity: "error",
        message: preview.error ?? "Workflow preview failed.",
      });
    } else if (
      preview.workflowSource !== "minimal" &&
      (preview.replacements?.positive ?? 0) === 0
    ) {
      issues.push({
        severity: "error",
        message:
          "Workflow has no positive prompt placeholder replacements. Add {{POSITIVE}} to a CLIP Text Encode node in Settings → ComfyUI workflow library (Apply bindings), or pick a workflow that includes prompt placeholders.",
      });
    }
  } catch (err) {
    issues.push({
      severity: "error",
      message: err instanceof Error ? err.message : "Workflow preview failed.",
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
