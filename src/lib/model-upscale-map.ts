import type { CustomWorkflowToken } from "./comfyui-config";

export const DEFAULT_UPSCALE_MODEL_TOKEN = "{{UPSCALE_MODEL}}";

/** Default UpscaleModel for non-Lightning Final/Max enrich when no per-model override exists. */
export const SUGGESTED_MODEL_UPSCALE_MAP: ModelUpscaleMap = {
  default: "4x-UltraSharp.pth",
};

export type ModelUpscaleMap = Partial<Record<string, string>>;

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveCustomTokenValue(
  token: string,
  customTokens?: CustomWorkflowToken[],
): string | undefined {
  if (!customTokens?.length) {
    return undefined;
  }
  const match = customTokens.find((entry) => entry.token.trim() === token);
  return trimFilename(match?.value);
}

export function resolveUpscaleModelFilename(
  model: string,
  options?: {
    upscaleMap?: ModelUpscaleMap;
    customTokens?: CustomWorkflowToken[];
  },
): string | undefined {
  const mapped =
    trimFilename(options?.upscaleMap?.[model]) ??
    trimFilename(options?.upscaleMap?.default);
  return (
    mapped ??
    resolveCustomTokenValue(DEFAULT_UPSCALE_MODEL_TOKEN, options?.customTokens)
  );
}

/**
 * When ComfyUI inventory is known and non-empty, only treat filenames present in
 * that list as usable. Unknown inventory (empty/undefined) keeps the mapped name.
 */
export function isUpscaleModelInstalled(
  filename: string | undefined,
  availableUpscaleModels?: string[] | null,
): boolean {
  const trimmed = trimFilename(filename);
  if (!trimmed) {
    return false;
  }
  if (!availableUpscaleModels || availableUpscaleModels.length === 0) {
    return true;
  }
  return availableUpscaleModels.includes(trimmed);
}

export function formatModelUpscaleMap(map: ModelUpscaleMap | undefined): string {
  if (!map) {
    return "";
  }
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, filename]) => `${key}=${filename.trim()}`)
    .join("\n");
}

export function parseModelUpscaleMap(text: string): ModelUpscaleMap {
  const map: ModelUpscaleMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.includes("=") ? "=" : ":";
    const [key, ...rest] = trimmed.split(separator);
    const filename = rest.join(separator).trim();
    if (key?.trim() && filename) {
      map[key.trim()] = filename;
    }
  }
  return map;
}
