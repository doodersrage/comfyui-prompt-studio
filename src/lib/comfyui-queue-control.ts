export type ComfyQueueDeleteInput = {
  promptId?: string;
  clear?: boolean;
};

export type ComfyQueueDeletePayload = {
  delete?: string[];
  clear?: boolean;
};

/** Builds the ComfyUI `POST /queue` body used to cancel or clear queue entries. */
export function buildComfyQueueDeletePayload(
  input: ComfyQueueDeleteInput,
): ComfyQueueDeletePayload {
  const payload: ComfyQueueDeletePayload = {};
  const promptId = input.promptId?.trim();
  if (promptId) {
    payload.delete = [promptId];
  }
  if (input.clear) {
    payload.clear = true;
  }
  return payload;
}

export type ComfyQueueActionResult = {
  ok: boolean;
  error?: string;
};

async function postComfyQueueAction(
  path: string,
  body: Record<string, unknown>,
): Promise<ComfyQueueActionResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: data.error ?? `Request failed: HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  }
}

/** Cancels a single queued/running ComfyUI job via `/api/comfyui/queue/delete`. */
export function deleteComfyQueuePrompt(input: {
  promptId: string;
  comfyUrl?: string;
  clear?: boolean;
}): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction("/api/comfyui/queue/delete", {
    promptId: input.promptId,
    comfyUrl: input.comfyUrl,
    clear: input.clear,
  });
}

/** Sends ComfyUI's `/interrupt`, optionally scoped to a specific pooled host. */
export function interruptComfyUiQueue(comfyUrl?: string): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction("/api/comfyui/interrupt", comfyUrl ? { comfyUrl } : {});
}

/**
 * Sends ComfyUI's `/free` (unload models + free VRAM), optionally scoped to a
 * specific pooled host. Best-effort — safe to call after any job completes.
 */
export function freeComfyUiMemory(comfyUrl?: string): Promise<ComfyQueueActionResult> {
  return postComfyQueueAction("/api/comfyui/free", comfyUrl ? { comfyUrl } : {});
}
