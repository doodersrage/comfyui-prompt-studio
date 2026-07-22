/**
 * Optional plugin queue hooks — URL callbacks invoked before a job is queued.
 * Bookmarks remain in tool-plugin-registry; this adds a thin executable surface.
 */

import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export type PluginQueueHook = {
  id: string;
  label: string;
  /** Absolute http(s) URL or same-origin path that accepts POST JSON. */
  url: string;
  enabled?: boolean;
};

export const PLUGIN_QUEUE_HOOKS_KEY = "plugin-queue-hooks-v1";

export type PluginQueueHookPayload = {
  event: "queue-preflight";
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
};

export type PluginQueueHookResult = {
  ok: boolean;
  blocked?: boolean;
  message?: string;
  prompt?: string;
  negativePrompt?: string;
};

export function loadPluginQueueHooks(): PluginQueueHook[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return (readBrowserValue<PluginQueueHook[]>(PLUGIN_QUEUE_HOOKS_KEY) ?? []).filter(
      (hook) => Boolean(hook.id?.trim() && hook.url?.trim()),
    );
  } catch {
    return [];
  }
}

export function savePluginQueueHooks(hooks: PluginQueueHook[]): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserValue(
    PLUGIN_QUEUE_HOOKS_KEY,
    hooks
      .map((hook) => ({
        id: hook.id.trim(),
        label: hook.label.trim() || hook.id.trim(),
        url: hook.url.trim(),
        enabled: hook.enabled !== false,
      }))
      .filter((hook) => hook.id && hook.url)
      .slice(0, 12),
  );
}

function isAllowedHookUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Run enabled queue-preflight hooks sequentially. A hook may rewrite prompts
 * or block the queue (`blocked: true`).
 */
export async function runPluginQueuePreflight(
  payload: PluginQueueHookPayload,
  hooks: PluginQueueHook[] = loadPluginQueueHooks(),
): Promise<{
  payload: PluginQueueHookPayload;
  blocked: boolean;
  messages: string[];
}> {
  let next = { ...payload };
  const messages: string[] = [];

  for (const hook of hooks) {
    if (hook.enabled === false || !isAllowedHookUrl(hook.url)) {
      continue;
    }
    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        messages.push(`${hook.label || hook.id}: HTTP ${response.status}`);
        continue;
      }
      const data = (await response.json()) as PluginQueueHookResult;
      if (data.message?.trim()) {
        messages.push(`${hook.label || hook.id}: ${data.message.trim()}`);
      }
      if (data.blocked) {
        return {
          payload: next,
          blocked: true,
          messages: messages.length
            ? messages
            : [`${hook.label || hook.id} blocked the queue.`],
        };
      }
      if (typeof data.prompt === "string" && data.prompt.trim()) {
        next = { ...next, prompt: data.prompt.trim() };
      }
      if (typeof data.negativePrompt === "string") {
        next = { ...next, negativePrompt: data.negativePrompt };
      }
    } catch (error) {
      messages.push(
        `${hook.label || hook.id}: ${
          error instanceof Error ? error.message : "hook failed"
        }`,
      );
    }
  }

  return { payload: next, blocked: false, messages };
}
