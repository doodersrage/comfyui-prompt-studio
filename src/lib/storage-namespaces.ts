export type StorageNamespace =
  | "settings-cache"
  | "prompt-history"
  | "comfy-gallery"
  | "scheduled-batch"
  | "webhook-settings"
  | "avoided-tokens"
  | "prompt-projects";

export const STORAGE_NAMESPACES: StorageNamespace[] = [
  "settings-cache",
  "prompt-history",
  "comfy-gallery",
  "scheduled-batch",
  "webhook-settings",
  "avoided-tokens",
  "prompt-projects",
];
