import type { ServerEnvSummary } from '@/lib/server-env-summary';

export const SETTINGS_TOOL_ACCENT = 'neutral' as const;

export function serverEnvFieldValue(
  serverEnv: ServerEnvSummary | undefined,
  key: string
): string | undefined {
  for (const group of serverEnv?.groups ?? []) {
    const field = group.fields.find(entry => entry.key === key);
    if (field?.value) {
      return field.value;
    }
  }
  return undefined;
}

export function formatModelWorkflowMap(map?: Record<string, string>): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .map(([modelId, workflowFileId]) => `${modelId}=${workflowFileId}`)
    .join('\n');
}

export function parseModelWorkflowMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const modelId = trimmed.slice(0, separator).trim();
    const workflowFileId = trimmed.slice(separator + 1).trim();
    if (modelId && workflowFileId) {
      map[modelId] = workflowFileId;
    }
  }
  return map;
}

export type HealthResponse = {
  llm: {
    ok: boolean;
    enabled: boolean;
    model?: string;
    visionModel?: string;
    baseUrl?: string;
    error?: string;
    inFlight?: number;
    maxInflight?: number;
    busy?: boolean;
  };
  comfyui: {
    ok: boolean;
    url: string;
    error?: string;
    queuePending?: number;
    queueRunning?: number;
    vram?: { free?: number; total?: number };
  };
  diffusers?: {
    ok: boolean;
    url: string;
    device?: string;
    model?: string;
    mock?: boolean;
    error?: string;
  };
  apiUsage?: {
    total: number;
    lastHour: number;
    rateLimited: number;
    avgDurationMs: number;
  };
  storage?: { enabled: boolean };
  workflow?: {
    apiUrl: string;
    workflowSource: 'client' | 'env' | 'none';
    placeholderTokens: { positive: string; negative: string };
    placeholders: { positive: number; negative: number };
    legacyNodeFallback: boolean;
    hasWorkflow: boolean;
  };
  config: {
    llmEnabled: boolean;
    allowTemplateFallback: boolean;
    llmModel: string;
    visionModel: string;
    comfyUiUrl: string;
  };
  serverEnv?: ServerEnvSummary;
  comfyuiPool?: {
    enabled: boolean;
    endpoints: Array<{
      index: number;
      ok: boolean;
      url: string;
      error?: string;
      queuePending?: number;
      queueRunning?: number;
      vram?: { free?: number; total?: number };
    }>;
  };
  collab?: {
    redisConfigured: boolean;
    redisConnected: boolean;
    filePersistence: boolean;
    backend: 'redis' | 'file' | 'memory';
  };
};
