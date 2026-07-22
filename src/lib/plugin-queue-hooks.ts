/**
 * Optional plugin queue hooks — URL callbacks invoked before a job is queued.
 * Bookmarks remain in tool-plugin-registry; this adds a thin executable surface.
 * Installed manifests (plugin-manifest) can also register queueHooks.
 */

import { readBrowserValue, writeBrowserValue } from "./browser-storage";
import { loadInstalledPlugins } from "./plugin-manifest";

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
  /** Sampler denoise — hooks may rewrite within a safe range. */
  denoise?: string | number;
  /** Sampler CFG — hooks may rewrite within a safe range. */
  cfg?: string | number;
};

export type PluginQueueHookResult = {
  ok?: boolean;
  blocked?: boolean;
  /** Human-readable block / status note (legacy). */
  message?: string;
  /** Preferred block reason when `blocked: true`. */
  reason?: string;
  prompt?: string;
  negativePrompt?: string;
  denoise?: string | number;
  cfg?: string | number;
};

const DENOISE_MIN = 0.05;
const DENOISE_MAX = 1;
const CFG_MIN = 0;
const CFG_MAX = 30;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Sanitize a hook-supplied denoise into a safe queue range, or null if invalid. */
export function normalizeHookDenoise(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed == null) {
    return null;
  }
  return clampNumber(parsed, DENOISE_MIN, DENOISE_MAX);
}

/** Sanitize a hook-supplied cfg into a safe queue range, or null if invalid. */
export function normalizeHookCfg(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed == null) {
    return null;
  }
  return clampNumber(parsed, CFG_MIN, CFG_MAX);
}

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

/** Queue hooks registered on enabled installed plugin manifests. */
export function loadManifestPluginQueueHooks(): PluginQueueHook[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return loadInstalledPlugins()
      .filter((plugin) => plugin.enabled !== false && plugin.queueHooks?.url)
      .filter((plugin) => {
        const events = plugin.queueHooks?.events ?? ["queue-preflight"];
        return events.includes("queue-preflight");
      })
      .map((plugin) => ({
        id: `manifest:${plugin.id}`,
        label: plugin.label,
        url: plugin.queueHooks!.url,
        enabled: true,
      }));
  } catch {
    return [];
  }
}

/** Manual hooks + enabled manifest queueHooks (manual ids win on collision). */
export function resolveActivePluginQueueHooks(
  manual: PluginQueueHook[] = loadPluginQueueHooks(),
  fromManifests: PluginQueueHook[] = loadManifestPluginQueueHooks(),
): PluginQueueHook[] {
  const byId = new Map<string, PluginQueueHook>();
  for (const hook of fromManifests) {
    byId.set(hook.id, hook);
  }
  for (const hook of manual) {
    byId.set(hook.id, hook);
  }
  return [...byId.values()];
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
 * Apply a single hook JSON result onto the payload (pure — used by preflight
 * and unit tests). Returns blocked + reason when the hook stops the queue.
 */
export function applyPluginQueueHookMutation(
  payload: PluginQueueHookPayload,
  result: PluginQueueHookResult,
): {
  payload: PluginQueueHookPayload;
  blocked: boolean;
  reason?: string;
} {
  const blockReason =
    (typeof result.reason === "string" && result.reason.trim()) ||
    (typeof result.message === "string" && result.message.trim()) ||
    undefined;

  if (result.blocked) {
    return {
      payload,
      blocked: true,
      reason: blockReason || "Plugin hook blocked the queue.",
    };
  }

  let next = { ...payload };
  if (typeof result.prompt === "string" && result.prompt.trim()) {
    next = { ...next, prompt: result.prompt.trim() };
  }
  if (typeof result.negativePrompt === "string") {
    next = { ...next, negativePrompt: result.negativePrompt };
  }
  const denoise = normalizeHookDenoise(result.denoise);
  if (denoise != null) {
    next = { ...next, denoise };
  }
  const cfg = normalizeHookCfg(result.cfg);
  if (cfg != null) {
    next = { ...next, cfg };
  }

  return { payload: next, blocked: false, reason: blockReason };
}

/**
 * Run enabled queue-preflight hooks sequentially. A hook may rewrite prompts /
 * denoise / cfg, or block the queue (`blocked: true` + reason/message).
 */
export async function runPluginQueuePreflight(
  payload: PluginQueueHookPayload,
  hooks: PluginQueueHook[] = resolveActivePluginQueueHooks(),
): Promise<{
  payload: PluginQueueHookPayload;
  blocked: boolean;
  messages: string[];
  reason?: string;
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
      const applied = applyPluginQueueHookMutation(next, data);
      if (applied.reason && !applied.blocked) {
        messages.push(`${hook.label || hook.id}: ${applied.reason}`);
      }
      if (applied.blocked) {
        const reason = applied.reason || `${hook.label || hook.id} blocked the queue.`;
        messages.push(`${hook.label || hook.id}: ${reason}`);
        return {
          payload: next,
          blocked: true,
          messages,
          reason,
        };
      }
      next = applied.payload;
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
