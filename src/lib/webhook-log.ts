import type { WebhookJobPayload } from "./webhook-settings";
import { dispatchWebhook } from "./webhook-settings";
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from "./browser-storage";

export const WEBHOOK_LOG_KEY = "comfy-prompt-webhook-log-v1";
export const WEBHOOK_LOG_UPDATED_EVENT = "webhook-log-updated";

export type WebhookLogEntry = {
  id: string;
  timestamp: number;
  event: WebhookJobPayload["event"];
  ok: boolean;
  url?: string;
  message?: string;
  payload: WebhookJobPayload;
};

const MAX_LOG_ENTRIES = 40;

export function loadWebhookLog(): WebhookLogEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return readBrowserValue<WebhookLogEntry[]>(WEBHOOK_LOG_KEY) ?? [];
  } catch {
    return [];
  }
}

function saveWebhookLog(entries: WebhookLogEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserValue(WEBHOOK_LOG_KEY, entries.slice(0, MAX_LOG_ENTRIES));
  window.dispatchEvent(new CustomEvent(WEBHOOK_LOG_UPDATED_EVENT));
}

export function appendWebhookLogEntry(input: {
  ok: boolean;
  url?: string;
  message?: string;
  payload: WebhookJobPayload;
}): WebhookLogEntry {
  const entry: WebhookLogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    event: input.payload.event,
    ok: input.ok,
    url: input.url,
    message: input.message,
    payload: input.payload,
  };
  saveWebhookLog([entry, ...loadWebhookLog()]);
  return entry;
}

export function clearWebhookLog(): void {
  if (typeof window === "undefined") {
    return;
  }
  removeBrowserKey(WEBHOOK_LOG_KEY);
  window.dispatchEvent(new CustomEvent(WEBHOOK_LOG_UPDATED_EVENT));
}

export async function retryWebhookLogEntry(entry: WebhookLogEntry): Promise<boolean> {
  const ok = await dispatchWebhook(entry.payload);
  appendWebhookLogEntry({
    ok,
    url: entry.url,
    message: ok ? "Retried successfully" : "Retry failed",
    payload: entry.payload,
  });
  return ok;
}
