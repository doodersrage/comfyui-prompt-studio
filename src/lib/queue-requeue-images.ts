"use client";

import type { WorkflowParamValues } from "./comfyui-config";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { buildComfyViewPath } from "./comfyui-outputs";
import { isEditCapableModel, isInpaintModel } from "./model-denoise-defaults";
import { resolveQueueInputImageFilename } from "./queue-input-image";

const EDIT_TOOLS = new Set(["refine", "inpaint", "image-prompt", "controlnet", "compose"]);

export function resolveRequeueImageUrlsFromEntry(
  entry: Pick<
    ComfyGalleryEntry,
    | "comfyUrl"
    | "images"
    | "tool"
    | "model"
    | "queueParams"
    | "sourceImageUrl"
    | "maskImageUrl"
  >,
): { sourceImageUrl?: string; maskImageUrl?: string } {
  if (entry.sourceImageUrl?.trim()) {
    return {
      sourceImageUrl: entry.sourceImageUrl.trim(),
      maskImageUrl: entry.maskImageUrl?.trim() || undefined,
    };
  }

  const comfyUrl = entry.comfyUrl?.replace(/\/+$/, "") ?? "";
  const params = entry.queueParams;

  const inputFromParams =
    params?.inputImageFilename?.trim() && comfyUrl
      ? buildComfyViewPath(comfyUrl, {
          filename: params.inputImageFilename.trim(),
          subfolder: "",
          type: "input",
        })
      : undefined;

  const maskFromParams =
    params?.maskImageFilename?.trim() && comfyUrl
      ? buildComfyViewPath(comfyUrl, {
          filename: params.maskImageFilename.trim(),
          subfolder: "",
          type: "input",
        })
      : undefined;

  const outputUrl =
    entry.images[0] && comfyUrl
      ? buildComfyViewPath(comfyUrl, entry.images[0])
      : undefined;

  const needsInput =
    Boolean(params?.inputImageFilename) ||
    isEditCapableModel(entry.model ?? "") ||
    (entry.tool ? EDIT_TOOLS.has(entry.tool) : false);

  return {
    sourceImageUrl: inputFromParams ?? (needsInput ? outputUrl : undefined),
    maskImageUrl: entry.maskImageUrl?.trim() ?? maskFromParams,
  };
}

export async function refreshQueueImageParamsForRequeue(input: {
  model?: string;
  tool?: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  forceInputImage?: boolean;
}): Promise<WorkflowParamValues | undefined> {
  const base = input.queueParams ? { ...input.queueParams } : {};
  const model = input.model ?? "";
  const hadInputFilename = Boolean(base.inputImageFilename?.trim());
  const hadMaskFilename = Boolean(base.maskImageFilename?.trim());
  const needsFreshInput =
    input.forceInputImage ||
    hadInputFilename ||
    isEditCapableModel(model) ||
    (input.tool ? EDIT_TOOLS.has(input.tool) : false);
  const needsFreshMask =
    hadMaskFilename || isInpaintModel(model) || input.tool === "inpaint";

  if (needsFreshInput && input.sourceImageUrl?.trim()) {
    try {
      base.inputImageFilename = await resolveQueueInputImageFilename({
        imageUrl: input.sourceImageUrl,
        filename: base.inputImageFilename,
        model,
      });
    } catch {
      // Keep stale filename; ComfyUI may reject it.
    }
  }

  if (needsFreshMask && input.maskImageUrl?.trim()) {
    try {
      base.maskImageFilename = await resolveQueueInputImageFilename({
        imageUrl: input.maskImageUrl,
        filename: base.maskImageFilename,
        model,
      });
    } catch {
      // Keep stale mask filename.
    }
  }

  if (Object.keys(base).length === 0) {
    return input.queueParams;
  }

  return base;
}

export function buildComfyUploadedImageViewUrl(
  comfyUrl: string,
  filename: string,
): string {
  return buildComfyViewPath(comfyUrl.replace(/\/+$/, ""), {
    filename: filename.trim(),
    subfolder: "",
    type: "input",
  });
}

export function buildGalleryImageUrlsFromQueueParams(input: {
  comfyUrl: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
}): { sourceImageUrl?: string; maskImageUrl?: string } {
  const comfyUrl = input.comfyUrl.replace(/\/+$/, "");
  const sourceImageUrl =
    input.sourceImageUrl?.trim() ||
    (input.queueParams?.inputImageFilename?.trim()
      ? buildComfyUploadedImageViewUrl(
          comfyUrl,
          input.queueParams.inputImageFilename.trim(),
        )
      : undefined);
  const maskImageUrl =
    input.maskImageUrl?.trim() ||
    (input.queueParams?.maskImageFilename?.trim()
      ? buildComfyUploadedImageViewUrl(
          comfyUrl,
          input.queueParams.maskImageFilename.trim(),
        )
      : undefined);

  return {
    ...(sourceImageUrl ? { sourceImageUrl } : {}),
    ...(maskImageUrl ? { maskImageUrl } : {}),
  };
}

export function auditRequeueImageReadiness(input: {
  model?: string;
  tool?: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  forceInputImage?: boolean;
}): Array<{ severity: "error" | "warn"; message: string }> {
  const issues: Array<{ severity: "error" | "warn"; message: string }> = [];
  const model = input.model ?? "";
  const needsInput =
    input.forceInputImage ||
    Boolean(input.queueParams?.inputImageFilename) ||
    isEditCapableModel(model) ||
    (input.tool ? EDIT_TOOLS.has(input.tool) : false);
  const needsMask =
    Boolean(input.queueParams?.maskImageFilename) ||
    isInpaintModel(model) ||
    input.tool === "inpaint";

  if (needsInput && !input.sourceImageUrl?.trim() && !input.queueParams?.inputImageFilename) {
    issues.push({
      severity: "warn",
      message: "Re-queue may fail — no source image URL available to refresh the ComfyUI upload.",
    });
  }

  if (needsMask && !input.maskImageUrl?.trim()) {
    issues.push({
      severity: "warn",
      message:
        "Inpaint re-queue without a refreshable mask URL — re-draw the mask or re-run from Refine/Inpaint.",
    });
  }

  return issues;
}
