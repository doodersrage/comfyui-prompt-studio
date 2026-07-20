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
  queuePending?: number;
  queueRunning?: number;
  vram?: { free?: number; total?: number };
};

type ComfyQueuePayload = {
  queue_pending?: unknown[];
  queue_running?: unknown[];
};

type ComfySystemStats = {
  system?: {
    vram?: { free?: number; total?: number };
  };
};

export async function getExpandedComfyUiHealth(
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyUiHealth> {
  const base = await checkComfyUiHealth(runtime);
  if (!base.ok) {
    return base;
  }

  let queuePending: number | undefined;
  let queueRunning: number | undefined;
  let vram: ComfyUiHealth["vram"];

  try {
    const [queueResponse, statsResponse] = await Promise.all([
      fetch(`${base.url}/queue`, { signal: AbortSignal.timeout(5000), redirect: "manual" }),
      fetch(`${base.url}/system_stats`, { signal: AbortSignal.timeout(5000), redirect: "manual" }),
    ]);

    if (queueResponse.ok) {
      const queue = (await queueResponse.json()) as ComfyQueuePayload;
      queuePending = queue.queue_pending?.length ?? 0;
      queueRunning = queue.queue_running?.length ?? 0;
    }

    if (statsResponse.ok) {
      const stats = (await statsResponse.json()) as ComfySystemStats;
      vram = stats.system?.vram;
    }
  } catch {
    // keep base health only
  }

  return { ...base, queuePending, queueRunning, vram };
}

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
