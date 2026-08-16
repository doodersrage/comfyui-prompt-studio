import { loadEngineSettings } from './engine-settings';
import { loadSettingsCache } from './settings-cache';
import type { ServerEnvSummary } from './server-env-summary';

type HealthPayload = {
  comfyui?: { ok?: boolean };
  serverEnv?: ServerEnvSummary;
};

function falKeyConfigured(summary?: ServerEnvSummary): boolean {
  if (!summary?.groups) {
    return false;
  }
  return summary.groups.some(group =>
    group.fields.some(field => field.key === 'FAL_KEY' && field.configured)
  );
}

/**
 * Prefer Fal I2V when handing a still to Video and local Comfy is down
 * (or already on Fal), as long as a Fal key exists in the session or server env.
 */
export async function preferFalForVideoStillHandoff(): Promise<boolean> {
  const engine = loadEngineSettings().engine;
  if (engine === 'fal') {
    return true;
  }
  if (engine !== 'comfyui') {
    return false;
  }
  const sessionKey = loadSettingsCache().shared.sessionFalApiKey?.trim();
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
    const data = (await response.json()) as HealthPayload;
    const comfyOk = data.comfyui?.ok === true;
    const falReady = Boolean(sessionKey) || falKeyConfigured(data.serverEnv);
    return !comfyOk && falReady;
  } catch {
    return Boolean(sessionKey);
  }
}
