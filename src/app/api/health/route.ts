import { checkComfyUiPoolHealth, checkLlmHealth, getExpandedComfyUiHealth } from "@/lib/service-health";
import { getLlmConfig, isLlmEnabled, allowTemplateFallback } from "@/lib/llm-client";
import { getComfyUiBaseUrl } from "@/lib/comfyui-client";
import { getComfyUiWorkflowSummary } from "@/lib/comfyui-status";
import { summarizeApiUsage } from "@/lib/api-usage-log";
import { isServerStorageEnabled } from "@/lib/server-storage";
import { isEmailConfigured } from "@/lib/email/config";
import {
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
} from "@/lib/comfyui-config";
import { apiJson } from "@/lib/api/response";
import { getAuthBootstrapInfo } from "@/lib/auth/store";
import { getServerEnvSummary } from "@/lib/server-env-summary";

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

  const [llm, comfyui, workflow, comfyuiPool] = await Promise.all([
    checkLlmHealth(),
    getExpandedComfyUiHealth(runtime),
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
    checkComfyUiPoolHealth(),
  ]);

  return apiJson({
    llm,
    comfyui,
    comfyuiPool,
    workflow,
    apiUsage: summarizeApiUsage(),
    storage: { enabled: isServerStorageEnabled() },
    email: { configured: isEmailConfigured() },
    auth: getAuthBootstrapInfo(),
    config: {
      llmEnabled: isLlmEnabled(),
      allowTemplateFallback: allowTemplateFallback(),
      llmModel: getLlmConfig().model,
      visionModel: getLlmConfig().visionModel,
      comfyUiUrl,
    },
    serverEnv: getServerEnvSummary(),
  });
}
