import {
  COMFYUI_MAX_BATCH_PROMPTS,
  queueBatchToComfyUi,
  queuePromptToComfyUi,
} from "@/lib/comfyui-client";
import {
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from "@/lib/comfyui-config";
import { apiError, apiJson, apiMethodNotAllowed } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ComfyUiRequestBody = {
  prompt?: string;
  prompts?: string[];
  negativePrompt?: string;
  nodeTitle?: string;
  params?: WorkflowParamValues;
  paramsPerPrompt?: WorkflowParamValues[];
  comfy?: ComfyUiRuntimeConfig;
};

export async function GET() {
  return apiMethodNotAllowed(["POST"], "/api/comfyui");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ComfyUiRequestBody;
    const runtime = stripEmptyComfyUiRuntime(body.comfy);
    const prompts = (
      body.prompts?.map((entry) => entry.trim()).filter(Boolean) ??
      (body.prompt?.trim() ? [body.prompt.trim()] : [])
    );

    if (prompts.length === 0) {
      return apiError("Prompt is required.", 400);
    }

    if (prompts.length > COMFYUI_MAX_BATCH_PROMPTS) {
      return apiError(
        `At most ${COMFYUI_MAX_BATCH_PROMPTS} prompts can be queued per request.`,
        400,
      );
    }

    if (prompts.length === 1) {
      const result = await queuePromptToComfyUi(
        {
          prompt: prompts[0]!,
          negativePrompt: body.negativePrompt,
          nodeTitle: body.nodeTitle,
          params: body.params,
        },
        runtime,
      );

      if (!result.ok) {
        return apiError(result.error ?? "ComfyUI queue failed.", 502, {
          comfyUrl: result.comfyUrl,
          workflowSource: result.workflowSource,
        });
      }

      return apiJson(result);
    }

    const batch = await queueBatchToComfyUi(
      prompts.map((prompt, index) => ({
        prompt,
        negativePrompt: body.negativePrompt,
        nodeTitle: body.nodeTitle,
        params: body.paramsPerPrompt?.[index] ?? body.params,
      })),
      runtime,
    );

    if (!batch.ok) {
      return apiError("No prompts were queued to ComfyUI.", 502, batch);
    }

    return apiJson(batch);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ComfyUI request failed.";
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(
      message,
    )
      ? 400
      : 500;
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
