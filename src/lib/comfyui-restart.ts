export const COMFYUI_MANAGER_RESTART_ATTEMPTS = [
  { path: '/api/manager/reboot', method: 'POST' as const },
  { path: '/api/manager/reboot', method: 'GET' as const },
  { path: '/manager/reboot', method: 'POST' as const },
  { path: '/manager/reboot', method: 'GET' as const },
];

export const COMFYUI_RESTART_UNAVAILABLE =
  'ComfyUI has no restart API on this host. Install ComfyUI-Manager (reboot) or restart the ComfyUI process, then refresh LoRA inventory.';

export type ComfyUiRestartResult =
  { ok: true; via: string } | { ok: false; error: string; missingManager?: boolean };

function isRestartInProgressError(message: string): boolean {
  return /econnreset|socket hang up/i.test(message);
}

/**
 * Ask ComfyUI-Manager to reboot. Vanilla ComfyUI has no restart endpoint.
 */
export async function requestComfyUiRestart(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ComfyUiRestartResult> {
  const origin = baseUrl.replace(/\/+$/, '');
  let any404 = false;
  let lastNetworkError: string | undefined;

  for (const attempt of COMFYUI_MANAGER_RESTART_ATTEMPTS) {
    const url = `${origin}${attempt.path}`;
    try {
      const response = await fetchImpl(url, {
        method: attempt.method,
        headers: attempt.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        signal: AbortSignal.timeout(8_000),
      });
      try {
        await response.arrayBuffer();
      } catch {
        // ignore body drain
      }
      if (response.ok || response.status === 202) {
        return { ok: true, via: attempt.path };
      }
      if (response.status === 404 || response.status === 405) {
        if (response.status === 404) {
          any404 = true;
        }
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: `ComfyUI-Manager restart requires auth (HTTP ${response.status}).`,
        };
      }
      return { ok: false, error: `ComfyUI restart failed: HTTP ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ComfyUI restart failed.';
      if (isRestartInProgressError(message)) {
        return { ok: true, via: attempt.path };
      }
      lastNetworkError = message;
    }
  }

  if (lastNetworkError && !any404) {
    return { ok: false, error: lastNetworkError };
  }
  return { ok: false, missingManager: true, error: COMFYUI_RESTART_UNAVAILABLE };
}
