export const DEFAULT_CONTROLNET_MODEL_TOKEN = "{{CONTROLNET_MODEL}}";
export const DEFAULT_CONTROL_IMAGE_TOKEN = "{{CONTROL_IMAGE}}";

export type ModelControlNetMap = Partial<Record<string, string>>;

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveControlNetModelFilename(
  model: string,
  input?: { controlNetMap?: ModelControlNetMap; customTokens?: Array<{ token: string; value: string }> },
): string | undefined {
  const fromMap =
    trimFilename(input?.controlNetMap?.[model]) ??
    trimFilename(input?.controlNetMap?.default);
  if (fromMap) {
    return fromMap;
  }
  const custom = Array.isArray(input?.customTokens)
    ? input.customTokens.find(
        (entry) => entry.token.trim() === DEFAULT_CONTROLNET_MODEL_TOKEN,
      )
    : undefined;
  return trimFilename(custom?.value);
}

export function formatModelControlNetMap(map: ModelControlNetMap | undefined): string {
  if (!map) {
    return "";
  }
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, filename]) => `${key}=${filename.trim()}`)
    .join("\n");
}

export function parseModelControlNetMap(text: string): ModelControlNetMap {
  const map: ModelControlNetMap = {};
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
