import { refineImagePrompt } from "@/lib/image-refine";
import {
  fileToDataUrl,
  normalizeImageDataUrl,
} from "@/lib/specialized/image-prompt-generator";
import { normalizeDetailLevel } from "@/lib/detail-level";
import { normalizeComfyModel } from "@/lib/comfy-models";
import { parseLlmRequestOptions } from "@/lib/llm-request-options";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function parseRefineRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? error.message
          : "Failed to parse body as FormData.";
      throw new Error(
        `Could not read the uploaded image (${detail}). Re-upload the reference and try again.`,
      );
    }
    const file = formData.get("image");

    if (!(file instanceof File)) {
      throw new Error("Image file is required.");
    }

    const mimeType = file.type?.startsWith("image/")
      ? file.type
      : "image/png";
    if (file.type && !file.type.startsWith("image/") && file.type !== "application/octet-stream") {
      throw new Error("Upload must be an image file.");
    }

    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Image must be 8MB or smaller.");
    }

    return {
      imageDataUrl: await fileToDataUrl(file),
      mimeType,
      model: String(formData.get("model") ?? ""),
      detail: String(formData.get("detail") ?? ""),
      currentPrompt: String(formData.get("currentPrompt") ?? "").trim() || undefined,
      intentHints: String(formData.get("intentHints") ?? "").trim() || undefined,
      llm: parseLlmRequestOptions(null),
    };
  }

  const body = (await request.json()) as {
    image?: string;
    mimeType?: string;
    model?: string;
    detail?: string;
    currentPrompt?: string;
    intentHints?: string;
    llmTemperature?: number;
    allowTemplateFallback?: boolean;
    llmModel?: string;
    llmVisionModel?: string;
    llmEnabled?: boolean;
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
    currentPrompt: body.currentPrompt?.trim() || undefined,
    intentHints: body.intentHints?.trim() || undefined,
    llm: parseLlmRequestOptions(body),
  };
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/refine");
}

export async function POST(request: Request) {
  let stage = "parse-request";
  try {
    const parsed = await parseRefineRequest(request);
    stage = "refine";
    const result = await refineImagePrompt({
      model: normalizeComfyModel(parsed.model),
      detail: normalizeDetailLevel(parsed.detail),
      imageDataUrl: parsed.imageDataUrl,
      mimeType: parsed.mimeType,
      currentPrompt: parsed.currentPrompt,
      intentHints: parsed.intentHints,
      llm: parsed.llm,
    });

    return apiJson(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image refine failed.";
    const status =
      /required|must be|could not read|upload must|too large|8mb/i.test(message)
        ? 400
        : 500;
    const stack =
      error instanceof Error && /call stack|Maximum call stack/i.test(message)
        ? error.stack?.split("\n").slice(0, 8).join(" | ")
        : undefined;
    return apiError(stack ? `${message} · ${stack}` : message, status, {
      stage,
    });
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
