import {
  getDiffusersBaseUrl,
  queueDiffusersTxt2Img,
} from "@/lib/diffusers-client";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DiffusersRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  clientId?: string;
  engineUrl?: string;
  params?: {
    seed?: string | number;
    width?: string | number;
    height?: string | number;
    steps?: string | number;
    cfg?: string | number;
  };
};

function toNumber(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/diffusers");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiffusersRequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return apiError("Prompt is required.", 400);
    }

    let engineUrlHint = body.engineUrl?.trim();
    try {
      // Validate early so client gets a clear 400.
      getDiffusersBaseUrl(engineUrlHint);
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : "Invalid Diffusers URL.",
        400,
      );
    }

    const params = body.params ?? {};
    const seedRaw = params.seed;
    const seed =
      seedRaw === undefined || seedRaw === "" || seedRaw === -1 || seedRaw === "-1"
        ? null
        : Math.trunc(toNumber(seedRaw, 0));

    // Diffusers defaults lean SDXL-friendly; the Python service further normalizes
    // Turbo vs XL once the checkpoint is resolved.
    const width = Math.max(64, Math.min(2048, Math.trunc(toNumber(params.width, 1024))));
    const height = Math.max(
      64,
      Math.min(2048, Math.trunc(toNumber(params.height, 1024))),
    );
    let steps = Math.max(1, Math.min(150, Math.trunc(toNumber(params.steps, 40))));
    // RealVis / photoreal SDXL prefers mid CFG; stock base liked ~7.
    let guidance = toNumber(params.cfg, 5.5);
    // Studio draft/Turbo often sends steps<=8 and cfg≈0 — lift before proxying.
    if (steps < 20 && guidance <= 2) {
      steps = 40;
      guidance = 5.5;
    } else if (guidance <= 0) {
      guidance = 5.5;
    }

    const result = await queueDiffusersTxt2Img(
      {
        prompt,
        negative_prompt: body.negativePrompt?.trim() || "",
        model: body.model?.trim() || undefined,
        width,
        height,
        steps,
        guidance_scale: guidance,
        seed,
        client_id: body.clientId?.trim() || undefined,
      },
      engineUrlHint,
    );

    if (!result.ok || !result.promptId) {
      return apiError(result.error ?? "Diffusers queue failed.", result.status || 502, {
        engineUrl: result.engineUrl,
      });
    }

    return apiJson({
      promptId: result.promptId,
      engineUrl: result.engineUrl,
      comfyUrl: result.engineUrl,
      clientId: body.clientId?.trim() || undefined,
      workflowSource: "diffusers",
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Diffusers queue failed.",
      502,
    );
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
