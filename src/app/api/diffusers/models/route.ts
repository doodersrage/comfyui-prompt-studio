import { fetchDiffusersModels, getDiffusersBaseUrl } from "@/lib/diffusers-client";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
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

  const listed = await fetchDiffusersModels(engineUrlHint);
  if (!listed) {
    return apiError("Diffusers model list failed.", 502);
  }

  return apiJson({
    models: listed.models,
    defaultModel: listed.defaultModel,
    searchPaths: listed.searchPaths,
    engineUrl: listed.engineUrl,
  });
}

export async function POST() {
  return apiMethodNotAllowed(["GET"], "/api/diffusers/models");
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
