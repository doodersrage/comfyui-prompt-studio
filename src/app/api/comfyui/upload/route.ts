import { getComfyUiBaseUrl } from "@/lib/comfyui-client";
import { stripEmptyComfyUiRuntime } from "@/lib/comfyui-config";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/comfyui/upload");
}

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return apiError("Image file is required.", 400);
    }

    const runtime = stripEmptyComfyUiRuntime({
      apiUrl: incoming.get("comfyUrl")?.toString(),
    });

    let comfyUrl: string;
    try {
      comfyUrl = getComfyUiBaseUrl(runtime);
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : "Invalid ComfyUI URL.",
        400,
      );
    }

    const uploadForm = new FormData();
    uploadForm.append("image", image, image.name);
    uploadForm.append("overwrite", "true");

    const response = await fetch(`${comfyUrl}/upload/image`, {
      method: "POST",
      body: uploadForm,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      return apiError(text || `ComfyUI upload returned HTTP ${response.status}`, 502);
    }

    const data = (await response.json()) as {
      name?: string;
      subfolder?: string;
      type?: string;
    };

    if (!data.name?.trim()) {
      return apiError("ComfyUI upload did not return a filename.", 502);
    }

    return apiJson({
      name: data.name.trim(),
      subfolder: data.subfolder?.trim() || "",
      type: data.type?.trim() || "input",
      comfyUrl,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "ComfyUI upload failed.",
      502,
    );
  }
}
