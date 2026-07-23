/**
 * Per-model default LoRA library id lists.
 * Line format: modelId=loraId1,loraId2
 * Empty value (modelId=) means no LoRAs for that model.
 */

export type ModelLoraMap = Partial<Record<string, string>>;

/** Explicit session LoRA picks keyed by model id (including empty stacks). */
export type SessionActiveLoraIdsByModel = Partial<Record<string, string[]>>;

/** No curated suggestions — users define ids from their LoRA library. */
export const SUGGESTED_MODEL_LORA_MAP: ModelLoraMap = {};

export function formatModelLoraMap(map: ModelLoraMap | undefined): string {
  if (!map) {
    return "";
  }
  return Object.entries(map)
    .filter(([modelId]) => Boolean(modelId?.trim()))
    .map(([modelId, value]) => `${modelId.trim()}=${(value ?? "").trim()}`)
    .join("\n");
}

export function parseModelLoraMap(text: string): ModelLoraMap {
  const map: ModelLoraMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.includes("=") ? "=" : ":";
    const index = trimmed.indexOf(separator);
    if (index <= 0) {
      continue;
    }
    const modelId = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (modelId) {
      // Preserve empty values — they mean an explicit empty LoRA stack.
      map[modelId] = value;
    }
  }
  return map;
}

/**
 * Resolve mapped default LoRA library ids for a model.
 * - `undefined` if the map has no key for the model
 * - `[]` if the key exists with an empty value
 * - otherwise the comma-separated id list
 */
export function resolveModelDefaultLoraIds(
  model: string | undefined,
  map: ModelLoraMap | undefined,
): string[] | undefined {
  const modelId = model?.trim();
  if (!modelId || !map || !Object.prototype.hasOwnProperty.call(map, modelId)) {
    return undefined;
  }
  const raw = (map[modelId] ?? "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function hasSessionLoraIdsForModel(
  byModel: SessionActiveLoraIdsByModel | undefined,
  model: string | undefined,
): boolean {
  const modelId = model?.trim();
  return Boolean(
    modelId &&
      byModel &&
      Object.prototype.hasOwnProperty.call(byModel, modelId),
  );
}

/** Write or clear a per-model session LoRA pick. */
export function setSessionLoraIdsForModel(
  byModel: SessionActiveLoraIdsByModel | undefined,
  model: string,
  ids: string[] | undefined,
): SessionActiveLoraIdsByModel {
  const modelId = model.trim();
  const next: SessionActiveLoraIdsByModel = { ...byModel };
  if (!modelId) {
    return next;
  }
  if (ids === undefined) {
    delete next[modelId];
  } else {
    next[modelId] = ids;
  }
  return next;
}

export type ResolveEffectiveSessionLoraIdsOptions = {
  sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel;
  /**
   * Legacy global session pick. Used only when this model has no per-model entry
   * and the by-model map is empty (migration / recipes).
   */
  sessionActiveLoraIds?: string[];
};

/**
 * Preference order for the active model:
 * 1. Per-model session picks (when that model has a stored key)
 * 2. Settings model LoRA map
 * 3. Empty stack (system default when untouched)
 *
 * Legacy global `sessionActiveLoraIds` is only used when the by-model store is
 * still empty (pre-migration); loadSettingsCache seeds the current model once.
 */
export function resolveEffectiveSessionLoraIds(
  sessionActiveLoraIds: string[] | undefined,
  model: string | undefined,
  modelLoraMap: ModelLoraMap | undefined,
  sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel,
): string[] | undefined {
  const modelId = model?.trim();
  if (hasSessionLoraIdsForModel(sessionActiveLoraIdsByModel, modelId)) {
    return sessionActiveLoraIdsByModel![modelId!] ?? [];
  }

  const fromMap = resolveModelDefaultLoraIds(modelId, modelLoraMap);
  if (fromMap !== undefined) {
    return fromMap;
  }

  const byModelEmpty =
    !sessionActiveLoraIdsByModel ||
    Object.keys(sessionActiveLoraIdsByModel).length === 0;
  if (sessionActiveLoraIds !== undefined && byModelEmpty) {
    return sessionActiveLoraIds;
  }

  // Untouched model: optimized system default is an empty session stack.
  return [];
}

/** Resolve which LoRA ids to show/apply when switching to a model. */
export function resolveLoraIdsForModelSelection(
  model: string | undefined,
  options: {
    sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel;
    modelLoraMap?: ModelLoraMap;
    sessionActiveLoraIds?: string[];
  },
): string[] | undefined {
  return resolveEffectiveSessionLoraIds(
    options.sessionActiveLoraIds,
    model,
    options.modelLoraMap,
    options.sessionActiveLoraIdsByModel,
  );
}
