import { readBrowserString, writeBrowserString } from "./browser-storage";

const KEY = "comfy-last-tool-route-v1";

const BLOCKED_PREFIXES = ["/login", "/forbidden", "/api"];

function isAllowedRoute(href: string): boolean {
  const path = (href.split("?")[0] || "/").trim() || "/";
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  return path.startsWith("/");
}

export function saveLastToolRoute(href: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = href.trim();
  if (!isAllowedRoute(trimmed)) {
    return;
  }
  writeBrowserString(KEY, trimmed);
}

export function loadLastToolRoute(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = readBrowserString(KEY)?.trim();
  if (!value || !isAllowedRoute(value)) {
    return null;
  }
  return value;
}

export function clearLastToolRoute(): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserString(KEY, "");
}
