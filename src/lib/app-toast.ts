import { readBrowserString, writeBrowserString } from "./browser-storage";

export type AppToastTone = "neutral" | "success" | "warning" | "danger" | "info";

export type AppToast = {
  id: string;
  text: string;
  tone: AppToastTone;
  href?: string;
  at: number;
};

export const APP_TOAST_EVENT = "app-toast";

const MAX_VISIBLE = 4;
const DEFAULT_TTL_MS = 6500;

let toasts: AppToast[] = [];

export function getAppToasts(): AppToast[] {
  return [...toasts];
}

function emit(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail: getAppToasts() }));
}

export function pushAppToast(input: {
  text: string;
  tone?: AppToastTone;
  href?: string;
  ttlMs?: number;
}): string | null {
  const text = input.text.trim();
  if (!text || typeof window === "undefined") {
    return null;
  }
  if (!loadToastPreferenceEnabled()) {
    return null;
  }
  const id = crypto.randomUUID();
  const entry: AppToast = {
    id,
    text,
    tone: input.tone ?? "neutral",
    href: input.href,
    at: Date.now(),
  };
  toasts = [entry, ...toasts].slice(0, MAX_VISIBLE);
  emit();
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  if (ttl > 0) {
    window.setTimeout(() => {
      dismissAppToast(id);
    }, ttl);
  }
  return id;
}

/** Convenience for Comfy queue / requeue outcomes. */
export function toastQueueOutcome(input: {
  ok: boolean;
  text: string;
  href?: string;
}): string | null {
  return pushAppToast({
    text: input.text,
    tone: input.ok ? "success" : "danger",
    href: input.href ?? (input.ok ? "/gallery" : "/queue"),
    ttlMs: input.ok ? 5000 : 9000,
  });
}

/** Sticky warning when Max jobs are parked until ComfyUI is idle. */
export function toastHeldMax(input: {
  text: string;
  count?: number;
}): string | null {
  const countNote =
    typeof input.count === "number" && input.count > 1
      ? ` (${input.count})`
      : "";
  return pushAppToast({
    text: `${input.text.trim()}${countNote}`,
    tone: "warning",
    href: "/queue",
    ttlMs: 14_000,
  });
}

/** One summary toast for bulk gallery/queue ops (avoids per-item noise). */
export function toastBulkQueueSummary(input: {
  label: string;
  queued: number;
  failed: number;
  skipped?: number;
}): string | null {
  const skippedPart =
    typeof input.skipped === "number" ? ` · ${input.skipped} skipped` : "";
  const text = `${input.label} · ${input.queued} queued${skippedPart} · ${input.failed} failed`;
  if (input.failed > 0) {
    return toastQueueOutcome({ ok: false, text, href: "/queue" });
  }
  if (input.queued === 0) {
    return pushAppToast({
      text,
      tone: "warning",
      href: "/gallery",
      ttlMs: 7000,
    });
  }
  return toastQueueOutcome({ ok: true, text, href: "/queue" });
}

export function dismissAppToast(id: string): void {
  const before = toasts.length;
  toasts = toasts.filter((toast) => toast.id !== id);
  if (toasts.length !== before) {
    emit();
  }
}

export function clearAppToasts(): void {
  if (toasts.length === 0) {
    return;
  }
  toasts = [];
  emit();
}

export function rememberToastPreference(enabled: boolean): void {
  writeBrowserString("comfy-app-toast-enabled-v1", enabled ? "1" : "0");
}

export function loadToastPreferenceEnabled(): boolean {
  const value = readBrowserString("comfy-app-toast-enabled-v1");
  return value !== "0";
}
