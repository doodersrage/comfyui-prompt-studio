import { fetchDiffusersJobStatus, getDiffusersBaseUrl } from "@/lib/diffusers-client";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const promptId = searchParams.get("promptId")?.trim();
  if (!promptId) {
    return apiError("promptId query parameter is required.", 400);
  }

  const engineUrlHint =
    searchParams.get("engineUrl")?.trim() ||
    searchParams.get("comfyUrl")?.trim() ||
    undefined;

  try {
    getDiffusersBaseUrl(engineUrlHint);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Invalid Diffusers URL.",
      400,
    );
  }

  const status = await fetchDiffusersJobStatus(promptId, engineUrlHint);
  if (!status) {
    return apiError("Diffusers status check failed.", 502);
  }

  return apiJson({
    promptId: status.promptId,
    status: status.status,
    statusMessage: status.statusMessage,
    engineUrl: status.engineUrl,
    comfyUrl: status.engineUrl,
    images: status.images,
    progressValue: status.progressValue,
    progressMax: status.progressMax,
    queuePosition: status.status === "pending" ? 1 : status.status === "running" ? 0 : null,
  });
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/diffusers/status");
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
