import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { normalizeDetailLevel } from "@/lib/detail-level";
import { normalizeComfyModel } from "@/lib/comfy-models";
import {
  fileToDataUrl,
  generateImagePrompt,
  normalizeImageDataUrl,
} from "@/lib/specialized/image-prompt-generator";
import type { ImagePromptFocus } from "@/lib/specialized/types";
import { normalizeImagePromptDescriptionPreset } from "@/lib/image-prompt-presets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeFocus(value: unknown): ImagePromptFocus {
  if (
    value === "subject" ||
    value === "background" ||
    value === "style" ||
    value === "full"
  ) {
    return value;
  }
  return "full";
}

async function parseImagePromptRequest(request: Request): Promise<{
  imageDataUrl: string;
  mimeType?: string;
  model: string;
  detail: string;
  focus: ImagePromptFocus;
  descriptionPreset: ReturnType<typeof normalizeImagePromptDescriptionPreset>;
  extraHints?: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      throw new Error("Image file is required.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Upload must be an image file.");
    }

    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Image must be 8MB or smaller.");
    }

    return {
      imageDataUrl: await fileToDataUrl(file),
      mimeType: file.type,
      model: String(formData.get("model") ?? ""),
      detail: String(formData.get("detail") ?? ""),
      focus: normalizeFocus(formData.get("focus")),
      descriptionPreset: normalizeImagePromptDescriptionPreset(
        formData.get("descriptionPreset"),
      ),
      extraHints: String(formData.get("extraHints") ?? "").trim() || undefined,
    };
  }

  const body = (await request.json()) as {
    image?: string;
    mimeType?: string;
    model?: string;
    detail?: string;
    focus?: ImagePromptFocus;
    descriptionPreset?: string;
    extraHints?: string;
  };

  if (!body.image?.trim()) {
    throw new Error("Image data is required.");
  }

  if (body.image.length > 12_000_000) {
    throw new Error("Image payload is too large.");
  }

  return {
    imageDataUrl: normalizeImageDataUrl(body.image.trim(), body.mimeType),
    mimeType: body.mimeType,
    model: body.model ?? "",
    detail: body.detail ?? "",
    focus: normalizeFocus(body.focus),
    descriptionPreset: normalizeImagePromptDescriptionPreset(body.descriptionPreset),
    extraHints: body.extraHints?.trim() || undefined,
  };
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/image-prompt");
}

export async function POST(request: Request) {
  try {
    const parsed = await parseImagePromptRequest(request);

    const result = await generateImagePrompt({
      model: normalizeComfyModel(parsed.model),
      detail: normalizeDetailLevel(parsed.detail),
      imageDataUrl: parsed.imageDataUrl,
      mimeType: parsed.mimeType,
      focus: parsed.focus,
      descriptionPreset: parsed.descriptionPreset,
      extraHints: parsed.extraHints,
    });

    return apiJson(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image prompt generation failed.";
    const status = /required|must be|too large/i.test(message) ? 400 : 500;
    return apiError(message, status);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
