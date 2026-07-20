import { listComfyUiHistoryImports } from "@/lib/comfyui-status";
import { stripEmptyComfyUiRuntime } from "@/lib/comfyui-config";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "40");
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get("comfyUrl") ?? undefined,
  });

  try {
    const items = await listComfyUiHistoryImports(
      runtime,
      Number.isFinite(limit) ? Math.min(80, Math.max(1, limit)) : 40,
    );
    return apiJson({ items, count: items.length, comfyUrl: items[0]?.comfyUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ComfyUI history import failed.";
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(
      message,
    )
      ? 400
      : 502;
    return apiError(message, status);
  }
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/comfyui/history");
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
