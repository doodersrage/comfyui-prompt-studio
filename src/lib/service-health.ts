import { getComfyUiBaseUrl } from "./comfyui-client";
import type { ComfyUiRuntimeConfig } from "./comfyui-config";
import { parseComfyUiPool, setComfyUiPoolStatsCache } from "./comfyui-pool";
import { getDiffusersBaseUrl } from "./diffusers-client";
import {
  getLlmConfig,
  getLlmInflightCount,
  getLlmMaxInflight,
  isLlmBusy,
  isLlmEnabled,
} from "./llm-client";

export type LlmHealth = {
  ok: boolean;
  enabled: boolean;
  model?: string;
  visionModel?: string;
  baseUrl?: string;
  error?: string;
  inFlight: number;
  maxInflight: number;
  busy: boolean;
};

export type ComfyUiHealth = {
  ok: boolean;
  url: string;
  error?: string;
  queuePending?: number;
  queueRunning?: number;
  vram?: { free?: number; total?: number };
};

export type ComfyUiPoolEndpointHealth = ComfyUiHealth & {
  index: number;
};

export type ComfyUiPoolHealth = {
  enabled: boolean;
  endpoints: ComfyUiPoolEndpointHealth[];
};

export type DiffusersHealth = {
  ok: boolean;
  url: string;
  device?: string;
  model?: string;
  mock?: boolean;
  error?: string;
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
  const inFlight = getLlmInflightCount();
  const maxInflight = getLlmMaxInflight();
  const busy = isLlmBusy();

  if (!enabled) {
    return {
      ok: false,
      enabled: false,
      model: config.model,
      visionModel: config.visionModel,
      baseUrl: config.baseUrl,
      error: "LLM_ENABLED=false",
      inFlight,
      maxInflight,
      busy,
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
        inFlight,
        maxInflight,
        busy,
      };
    }

    return {
      ok: true,
      enabled: true,
      model: config.model,
      visionModel: config.visionModel,
      baseUrl: config.baseUrl,
      inFlight,
      maxInflight,
      busy,
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      model: config.model,
      visionModel: config.visionModel,
      baseUrl: config.baseUrl,
      error: error instanceof Error ? error.message : "LLM unreachable",
      inFlight,
      maxInflight,
      busy,
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

export async function checkDiffusersHealth(
  engineUrlHint?: string,
): Promise<DiffusersHealth> {
  let url: string;
  try {
    url = getDiffusersBaseUrl(engineUrlHint);
  } catch (error) {
    return {
      ok: false,
      url: engineUrlHint?.trim() || "",
      error: error instanceof Error ? error.message : "Invalid Diffusers URL",
    };
  }

  try {
    const response = await fetch(`${url}/v1/health`, {
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
    });
    if (!response.ok) {
      return { ok: false, url, error: `HTTP ${response.status}` };
    }
    const raw = (await response.json()) as {
      ok?: boolean;
      device?: string;
      model?: string;
      mock?: boolean;
    };
    return {
      ok: raw.ok !== false,
      url,
      device: typeof raw.device === "string" ? raw.device : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      mock: Boolean(raw.mock),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "Diffusers unreachable",
    };
  }
}

export async function checkComfyUiPoolHealth(): Promise<ComfyUiPoolHealth> {
  const pool = parseComfyUiPool();
  if (pool.length === 0) {
    return { enabled: false, endpoints: [] };
  }

  const endpoints = await Promise.all(
    pool.map(async (url, index) => {
      const health = await checkComfyUiHealth({ apiUrl: url });
      const expanded = health.ok ? await getExpandedComfyUiHealth({ apiUrl: url }) : health;
      return { ...expanded, index };
    }),
  );

  // Feed the VRAM-aware pool pick cache in comfyui-pool.ts so getComfyUiBaseUrl()
  // can prefer the healthiest/most-free-VRAM endpoint on the next request.
  setComfyUiPoolStatsCache(
    endpoints.map((endpoint) => ({
      url: endpoint.url,
      ok: endpoint.ok,
      vram: endpoint.vram,
      queuePending: endpoint.queuePending,
      queueRunning: endpoint.queueRunning,
    })),
  );

  return { enabled: true, endpoints };
}
