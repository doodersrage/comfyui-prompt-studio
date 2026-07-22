import { readBrowserValue, writeBrowserValue } from "./browser-storage";
import { COMFY_MODEL_IDS, type ComfyImageModel } from "./comfy-models/client";
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from "./model-sampler-defaults";
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from "./model-resolution-defaults";
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";

export const SESSION_RECIPES_KEY = "comfy-prompt-session-recipes-v1";
export const MAX_SESSION_RECIPES = 20;

export type SessionRecipeShared = {
  model: ComfyImageModel;
  queueQualityProfile?: QueueQualityProfile;
  sessionQueueMode?: "iterate" | "keeper" | "off";
  sessionActiveLoraIds?: string[];
  modelSamplerPreset?: ModelSamplerPresetTier;
  modelResolutionOrientation?: ResolutionOrientation;
  modelResolutionSizeTier?: ResolutionSizeTier;
  editDenoiseStrength?: number;
};

export type SessionRecipe = {
  id: string;
  label: string;
  savedAt: number;
  toolId?: string;
  shared: SessionRecipeShared;
};

function normalizeSessionMode(
  value: unknown,
): "iterate" | "keeper" | "off" | undefined {
  if (value === "iterate" || value === "keeper" || value === "off") {
    return value;
  }
  return undefined;
}

export function normalizeSessionRecipe(value: unknown): SessionRecipe | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 64) : "";
  if (!id) {
    return null;
  }
  const sharedRaw =
    record.shared && typeof record.shared === "object"
      ? (record.shared as Record<string, unknown>)
      : null;
  if (!sharedRaw) {
    return null;
  }
  const modelRaw = typeof sharedRaw.model === "string" ? sharedRaw.model.trim() : "";
  if (!modelRaw || !COMFY_MODEL_IDS.has(modelRaw)) {
    return null;
  }
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label.trim().slice(0, 48)
      : "Session";
  const savedAt = Number(record.savedAt);
  const loraIds = Array.isArray(sharedRaw.sessionActiveLoraIds)
    ? sharedRaw.sessionActiveLoraIds
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
        .slice(0, 32)
    : undefined;
  const denoise = Number(sharedRaw.editDenoiseStrength);
  return {
    id,
    label,
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    toolId:
      typeof record.toolId === "string" && record.toolId.trim()
        ? record.toolId.trim().slice(0, 32)
        : undefined,
    shared: {
      model: modelRaw as ComfyImageModel,
      queueQualityProfile: sharedRaw.queueQualityProfile
        ? normalizeQueueQualityProfile(sharedRaw.queueQualityProfile)
        : undefined,
      sessionQueueMode: normalizeSessionMode(sharedRaw.sessionQueueMode),
      sessionActiveLoraIds: loraIds,
      modelSamplerPreset: sharedRaw.modelSamplerPreset
        ? normalizeModelSamplerPresetTier(sharedRaw.modelSamplerPreset)
        : undefined,
      modelResolutionOrientation: sharedRaw.modelResolutionOrientation
        ? normalizeResolutionOrientation(sharedRaw.modelResolutionOrientation)
        : undefined,
      modelResolutionSizeTier: sharedRaw.modelResolutionSizeTier
        ? normalizeResolutionSizeTier(sharedRaw.modelResolutionSizeTier)
        : undefined,
      editDenoiseStrength:
        Number.isFinite(denoise) && denoise >= 0.05 && denoise <= 1
          ? Math.round(denoise * 100) / 100
          : undefined,
    },
  };
}

export function loadSessionRecipes(): SessionRecipe[] {
  const raw = readBrowserValue<unknown>(SESSION_RECIPES_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => normalizeSessionRecipe(entry))
    .filter((entry): entry is SessionRecipe => Boolean(entry))
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_SESSION_RECIPES);
}

export function saveSessionRecipes(recipes: SessionRecipe[]): void {
  writeBrowserValue(
    SESSION_RECIPES_KEY,
    recipes
      .map((entry) => normalizeSessionRecipe(entry))
      .filter((entry): entry is SessionRecipe => Boolean(entry))
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_SESSION_RECIPES),
  );
}

export function buildSessionRecipeFromShared(input: {
  shared: SessionRecipeShared & Record<string, unknown>;
  toolId?: string;
  label?: string;
}): SessionRecipe {
  const stamp = Date.now();
  const tool = input.toolId?.trim();
  const label =
    input.label?.trim() ||
    (tool ? `Session · ${tool}` : "Session snapshot");
  return {
    id: `session-${stamp.toString(36)}`,
    label: label.slice(0, 48),
    savedAt: stamp,
    toolId: tool || undefined,
    shared: {
      model: input.shared.model,
      queueQualityProfile: input.shared.queueQualityProfile
        ? normalizeQueueQualityProfile(input.shared.queueQualityProfile)
        : undefined,
      sessionQueueMode: normalizeSessionMode(input.shared.sessionQueueMode),
      sessionActiveLoraIds: Array.isArray(input.shared.sessionActiveLoraIds)
        ? input.shared.sessionActiveLoraIds
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, 32)
        : undefined,
      modelSamplerPreset: input.shared.modelSamplerPreset
        ? normalizeModelSamplerPresetTier(input.shared.modelSamplerPreset)
        : undefined,
      modelResolutionOrientation: input.shared.modelResolutionOrientation
        ? normalizeResolutionOrientation(input.shared.modelResolutionOrientation)
        : undefined,
      modelResolutionSizeTier: input.shared.modelResolutionSizeTier
        ? normalizeResolutionSizeTier(input.shared.modelResolutionSizeTier)
        : undefined,
      editDenoiseStrength:
        typeof input.shared.editDenoiseStrength === "number" &&
        Number.isFinite(input.shared.editDenoiseStrength)
          ? input.shared.editDenoiseStrength
          : undefined,
    },
  };
}

/** Prepend a snapshot; drops oldest past the cap. */
export function pushSessionRecipe(recipe: SessionRecipe): SessionRecipe[] {
  const next = [
    recipe,
    ...loadSessionRecipes().filter((entry) => entry.id !== recipe.id),
  ].slice(0, MAX_SESSION_RECIPES);
  saveSessionRecipes(next);
  return next;
}

export function deleteSessionRecipe(id: string): SessionRecipe[] {
  const next = loadSessionRecipes().filter((entry) => entry.id !== id);
  saveSessionRecipes(next);
  return next;
}

/** Merge session snapshot fields onto shared settings. */
export function applySessionRecipeShared<T extends SessionRecipeShared>(
  shared: T,
  recipe: SessionRecipe,
): T {
  const snap = recipe.shared;
  return {
    ...shared,
    model: snap.model,
    ...(snap.queueQualityProfile
      ? { queueQualityProfile: snap.queueQualityProfile }
      : {}),
    ...(snap.sessionQueueMode ? { sessionQueueMode: snap.sessionQueueMode } : {}),
    sessionActiveLoraIds: snap.sessionActiveLoraIds,
    ...(snap.modelSamplerPreset
      ? { modelSamplerPreset: snap.modelSamplerPreset }
      : {}),
    ...(snap.modelResolutionOrientation
      ? { modelResolutionOrientation: snap.modelResolutionOrientation }
      : {}),
    ...(snap.modelResolutionSizeTier
      ? { modelResolutionSizeTier: snap.modelResolutionSizeTier }
      : {}),
    ...(snap.editDenoiseStrength != null
      ? { editDenoiseStrength: snap.editDenoiseStrength }
      : {}),
  };
}

export function formatSessionRecipeSubtitle(recipe: SessionRecipe): string {
  const parts = [recipe.shared.model];
  if (recipe.shared.queueQualityProfile) {
    parts.push(recipe.shared.queueQualityProfile);
  }
  if (recipe.shared.sessionActiveLoraIds) {
    parts.push(`${recipe.shared.sessionActiveLoraIds.length} LoRAs`);
  }
  if (recipe.toolId) {
    parts.push(recipe.toolId);
  }
  return parts.join(" · ");
}
