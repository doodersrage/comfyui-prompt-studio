import { checkComfyUiHealth, checkLlmHealth } from "@/lib/service-health";
import { getLlmConfig, isLlmEnabled, allowTemplateFallback } from "@/lib/llm-client";
import { getComfyUiBaseUrl } from "@/lib/comfyui-client";
import { getComfyUiWorkflowSummary } from "@/lib/comfyui-status";
import {
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
} from "@/lib/comfyui-config";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";

function parseRuntimeFromSearch(searchParams: URLSearchParams): ComfyUiRuntimeConfig | undefined {
  return stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get("comfyUrl") ?? undefined,
    positiveToken: searchParams.get("positiveToken") ?? undefined,
    negativeToken: searchParams.get("negativeToken") ?? undefined,
  });
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const runtime = parseRuntimeFromSearch(searchParams);

  let comfyUiUrl = "";
  try {
    comfyUiUrl = getComfyUiBaseUrl(runtime);
  } catch {
    comfyUiUrl = "";
  }

  const [llm, comfyui, workflow] = await Promise.all([
    checkLlmHealth(),
    checkComfyUiHealth(runtime),
    (async () => {
      try {
        return await getComfyUiWorkflowSummary(runtime);
      } catch (error) {
        return {
          apiUrl: comfyUiUrl,
          workflowSource: "none" as const,
          error: error instanceof Error ? error.message : "Invalid ComfyUI config",
        };
      }
    })(),
  ]);

  return apiJson({
    llm,
    comfyui,
    workflow,
    config: {
      llmEnabled: isLlmEnabled(),
      allowTemplateFallback: allowTemplateFallback(),
      llmModel: getLlmConfig().model,
      visionModel: getLlmConfig().visionModel,
      comfyUiUrl,
    },
  });
}
