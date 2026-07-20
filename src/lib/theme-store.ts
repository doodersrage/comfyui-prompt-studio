import { readBrowserString, writeBrowserString } from "./browser-storage";

export type AppTheme = "dark" | "light";

const KEY = "comfy-app-theme-v1";

export function loadAppTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "dark";
  }
  return readBrowserString(KEY) === "light" ? "light" : "dark";
}

export function saveAppTheme(theme: AppTheme): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserString(KEY, theme);
  document.documentElement.dataset.theme = theme;
}

export function applyAppTheme(): void {
  if (typeof window === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = loadAppTheme();
}
