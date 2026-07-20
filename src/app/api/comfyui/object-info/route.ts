import { fetchComfyObjectInfoModelLists } from "@/lib/comfyui-object-info";
import { stripEmptyComfyUiRuntime } from "@/lib/comfyui-config";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get("comfyUrl") ?? undefined,
  });

  try {
    const models = await fetchComfyObjectInfoModelLists(runtime);
    if (!models) {
      return apiError("Could not read ComfyUI object_info.", 502);
    }
    return apiJson({ ok: true, models });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ComfyUI object_info check failed.";
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(message)
      ? 400
      : 502;
    return apiError(message, status);
  }
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/comfyui/object-info");
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
