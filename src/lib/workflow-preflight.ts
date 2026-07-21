"use client";

import { modelUsesNegativePrompt } from "./prompt-pair";
import type { ComfyImageModel } from "./comfy-models";
import { isInpaintModel, isEditQueueTool } from "./model-denoise-defaults";
import { resolveRuntimeForQueue } from "./comfyui-runtime-for-model";
import { fetchWorkflowPreview } from "./comfyui-requeue";
import { resolveQueueParams } from "./queue-params-settings";
import type { WorkflowParamValues } from "./comfyui-config";
import { auditLoaderMapsAtQueueTime } from "./workflow-queue-loader-preflight";
import { fetchComfyObjectInfoCached } from "./comfyui-object-info-cache";
import {
  collectWorkflowGraphPreflightIssues,
  type WorkflowPreflightIssue,
} from "./workflow-preflight-core";

export type { WorkflowPreflightIssue };

export type WorkflowPreflightResult = {
  ok: boolean;
  issues: WorkflowPreflightIssue[];
};

export async function runWorkflowPreflight(input: {
  model: ComfyImageModel | string;
  prompts: string[];
  negativePrompt?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  hasControlImage?: boolean;
  tool?: string;
  queueParams?: WorkflowParamValues;
  qualityProfile?: import("./queue-quality-profile").QueueQualityProfile;
  comfy?: import("./comfyui-config").ComfyUiRuntimeConfig;
}): Promise<WorkflowPreflightResult> {
  const issues: WorkflowPreflightIssue[] = [];
  const runtime =
    input.comfy ??
    resolveRuntimeForQueue(input.model as ComfyImageModel, input.tool);

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

  if (
    isInpaintModel(input.model) &&
    !input.hasMaskImage &&
    !input.hasInputImage
  ) {
    issues.push({
      severity: "warn",
      message:
        "Inpaint model queued without a source image or mask — upload both before Send to ComfyUI.",
    });
  } else if (isInpaintModel(input.model) && !input.hasMaskImage) {
    issues.push({
      severity: "warn",
      message:
        "Inpaint model queued without a mask — white pixels mark the edit region.",
    });
  }

  const samplePrompt = input.prompts.find((entry) => entry.trim())?.trim();
  if (!samplePrompt) {
    issues.push({ severity: "error", message: "No prompts to queue." });
    return { ok: false, issues };
  }

  const previewParams = resolveQueueParams({
    model: input.model,
    tool: input.tool,
    base: input.queueParams,
    qualityProfile: input.qualityProfile,
    inputImageFilename: input.hasInputImage
      ? input.queueParams?.inputImageFilename?.trim() || "preview-input.png"
      : undefined,
    maskImageFilename: input.hasMaskImage
      ? input.queueParams?.maskImageFilename?.trim() || "preview-mask.png"
      : undefined,
    controlImageFilename: input.hasControlImage
      ? input.queueParams?.controlImageFilename?.trim() || "preview-control.png"
      : undefined,
  });

  try {
    const preview = await fetchWorkflowPreview({
      prompt: samplePrompt,
      negativePrompt: input.negativePrompt,
      model: input.model,
      params: previewParams,
      hasInputImage: input.hasInputImage,
      hasMaskImage: input.hasMaskImage,
      comfy: runtime,
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
          "Workflow has no positive prompt placeholder replacements. Add {{POSITIVE}} to a CLIPText Encode node in Settings → ComfyUI workflow library (Apply bindings), or pick a workflow that includes prompt placeholders.",
      });
    }

    if (
      !isEditQueueTool(input.tool) &&
      preview.workflowJson?.includes("{{INPUT_IMAGE}}")
    ) {
      issues.push({
        severity: "error",
        message:
          "Selected workflow expects an input image (edit/inpaint) — pick a txt2img workflow in Settings → workflow library or run Optimize all with a generate scaffold.",
      });
    }

    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl: runtime?.apiUrl,
    });

    issues.push(
      ...collectWorkflowGraphPreflightIssues({
        workflowJson: preview.workflowJson,
        model: input.model,
        hasInputImage: input.hasInputImage,
        hasMaskImage: input.hasMaskImage,
        syncWorkflowLoadersToModel: runtime?.syncWorkflowLoadersToModel,
        knownNodeTypes: objectInfo?.nodeTypes,
        models: objectInfo?.models,
        objectInfoUnavailable: !objectInfo,
      }),
    );

    const loaderIssues = await auditLoaderMapsAtQueueTime({
      model: input.model,
      comfyUrl: runtime?.apiUrl,
      workflowJson: preview.workflowJson,
    });
    issues.push(...loaderIssues);
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
