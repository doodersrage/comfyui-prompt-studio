import { getComfyUiBaseUrl } from "./comfyui-client";
import type { ComfyUiRuntimeConfig } from "./comfyui-config";
import { getLlmConfig, isLlmEnabled } from "./llm-client";

export type LlmHealth = {
  ok: boolean;
  enabled: boolean;
  model?: string;
  visionModel?: string;
  baseUrl?: string;
  error?: string;
};

export type ComfyUiHealth = {
  ok: boolean;
  url: string;
  error?: string;
};

export async function checkLlmHealth(): Promise<LlmHealth> {
  const enabled = isLlmEnabled();
  const config = getLlmConfig();

  if (!enabled) {
    return {
      ok: false,
      enabled: false,
      model: config.model,
      visionModel: config.visionModel,
      baseUrl: config.baseUrl,
      error: "LLM_ENABLED=false",
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        ok: false,
        enabled: true,
        model: config.model,
        visionModel: config.visionModel,
        baseUrl: config.baseUrl,
        error: `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      enabled: true,
      model: config.model,
      visionModel: config.visionModel,
      baseUrl: config.baseUrl,
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      model: config.model,
      visionModel: config.visionModel,
      baseUrl: config.baseUrl,
      error: error instanceof Error ? error.message : "LLM unreachable",
    };
  }
}

export async function checkComfyUiHealth(
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyUiHealth> {
  let url: string;
  try {
    url = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return {
      ok: false,
      url: runtime?.apiUrl?.trim() || "",
      error: error instanceof Error ? error.message : "Invalid ComfyUI URL",
    };
  }

  try {
    const response = await fetch(`${url}/system_stats`, {
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
    });

    if (!response.ok) {
      return { ok: false, url, error: `HTTP ${response.status}` };
    }

    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "ComfyUI unreachable",
    };
  }
}
