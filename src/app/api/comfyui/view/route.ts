import { getComfyUiBaseUrl } from "@/lib/comfyui-client";
import { stripEmptyComfyUiRuntime } from "@/lib/comfyui-config";
import { apiError, apiMethodNotAllowed } from "@/lib/api/response";
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from "@/lib/url-safety";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  let filename: string;
  let subfolder: string;
  let type: "output" | "input" | "temp";
  try {
    filename = sanitizeComfyViewFilename(searchParams.get("filename") ?? "");
    subfolder = sanitizeComfyViewSubfolder(searchParams.get("subfolder") ?? "");
    type = normalizeComfyViewType(searchParams.get("type")?.trim() || "output");
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Invalid view parameters.",
      400,
    );
  }

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get("comfyUrl") ?? undefined,
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

  const viewUrl = new URL(`${comfyUrl}/view`);
  viewUrl.searchParams.set("filename", filename);
  viewUrl.searchParams.set("subfolder", subfolder);
  viewUrl.searchParams.set("type", type);

  try {
    const response = await fetch(viewUrl.toString(), {
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });

    if (!response.ok) {
      return apiError(`ComfyUI view returned HTTP ${response.status}`, 502);
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) {
      return apiError("ComfyUI view did not return an image.", 502);
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to fetch ComfyUI image",
      502,
    );
  }
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/comfyui/view");
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
