import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { buildComfyViewPath } from "./comfyui-outputs";
import type { WorkflowParamValues } from "./comfyui-config";
import type { QueueQualityProfile } from "./queue-quality-profile";
import { setLineageParent } from "./prompt-lineage-session";
import { loadSettingsCache } from "./settings-cache";

export const GALLERY_HANDOFF_KEY = "gallery-handoff-v1";
export const IMPROVE_INTENT_DEFAULT =
  "Improve fidelity, composition, and prompt alignment while preserving subject identity and scene intent.";

export type GalleryHandoffMode = "reedit" | "upscale-native" | "upscale-polish";

export type GalleryHandoffPayload = {
  source: "gallery" | "history";
  galleryEntryId: string;
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  hints?: string;
  historyId?: string;
  imageUrl?: string;
  imageFilename?: string;
  target: "refine" | "imagePrompt" | "promptEditor" | "inpaint" | "outpaint" | "controlnet" | "video" | "compose";
  improveIntent?: string;
  queueParams?: WorkflowParamValues;
  /** Restore LoRA session picks (from entry or current session). */
  sessionActiveLoraIds?: string[];
  queueQualityProfile?: QueueQualityProfile;
  /** reedit = open tool with same stack; upscale-* routed via gallery enhance actions. */
  handoffMode?: GalleryHandoffMode;
  savedAt: number;
};

export type BuildGalleryHandoffOptions = {
  handoffMode?: GalleryHandoffMode;
  /** Prefer entry.sessionActiveLoraIds; fall back to current session when true. */
  includeSessionLoras?: boolean;
};

function resolveHandoffLoraIds(
  entry: ComfyGalleryEntry,
  includeSessionLoras: boolean,
): string[] | undefined {
  if (entry.sessionActiveLoraIds && entry.sessionActiveLoraIds.length > 0) {
    return entry.sessionActiveLoraIds.map((id) => id.trim()).filter(Boolean);
  }
  if (!includeSessionLoras) {
    return undefined;
  }
  const session = loadSettingsCache().shared.sessionActiveLoraIds;
  if (!session || session.length === 0) {
    return undefined;
  }
  return session.map((id) => id.trim()).filter(Boolean);
}

export function buildImproveGalleryHandoff(entry: ComfyGalleryEntry): GalleryHandoffPayload {
  return {
    ...buildGalleryHandoff(entry, "refine"),
    improveIntent: IMPROVE_INTENT_DEFAULT,
  };
}

export function galleryImprovePath(): string {
  return "/refine?from=gallery&improve=1";
}

export function buildGalleryHandoff(
  entry: ComfyGalleryEntry,
  target: GalleryHandoffPayload["target"],
  options?: BuildGalleryHandoffOptions,
): GalleryHandoffPayload {
  const image = entry.images[0];
  if (entry.historyId) {
    setLineageParent({
      parentHistoryId: entry.historyId,
      sourcePrompt: entry.prompt,
      sourceTool: entry.tool,
    });
  }
  const handoffMode = options?.handoffMode ?? "reedit";
  const includeLoras = options?.includeSessionLoras ?? handoffMode === "reedit";
  return {
    source: "gallery",
    galleryEntryId: entry.id,
    promptId: entry.promptId,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    model: entry.model,
    tool: entry.tool,
    historyId: entry.historyId,
    imageUrl: image ? buildComfyViewPath(entry.comfyUrl, image) : undefined,
    imageFilename: image?.filename,
    queueParams: entry.queueParams,
    queueQualityProfile: entry.queueQualityProfile,
    sessionActiveLoraIds: resolveHandoffLoraIds(entry, includeLoras),
    handoffMode,
    target,
    savedAt: Date.now(),
  };
}

/** Re-edit with the same LoRA stack / quality when available. */
export function buildReeditGalleryHandoff(
  entry: ComfyGalleryEntry,
  target: Extract<GalleryHandoffPayload["target"], "compose" | "refine">,
): GalleryHandoffPayload {
  return buildGalleryHandoff(entry, target, {
    handoffMode: "reedit",
    includeSessionLoras: true,
  });
}

export function saveGalleryHandoff(payload: GalleryHandoffPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(GALLERY_HANDOFF_KEY, JSON.stringify(payload));
}

export function loadGalleryHandoff(
  target?: GalleryHandoffPayload["target"],
): GalleryHandoffPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(GALLERY_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as GalleryHandoffPayload;
    if (
      (parsed.source !== "gallery" && parsed.source !== "history") ||
      !parsed.prompt?.trim()
    ) {
      return null;
    }
    if (target && parsed.target !== target) {
      return null;
    }
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(GALLERY_HANDOFF_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGalleryHandoff(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(GALLERY_HANDOFF_KEY);
}

export async function fetchHandoffImageFile(
  payload: GalleryHandoffPayload,
): Promise<File | null> {
  if (!payload.imageUrl) {
    return null;
  }

  const response = await fetch(payload.imageUrl);
  if (!response.ok) {
    throw new Error(`Could not load gallery image (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const filename =
    payload.imageFilename?.trim() ||
    `gallery-${payload.promptId.slice(0, 8)}.png`;
  return new File([blob], filename, { type: blob.type || "image/png" });
}

export function galleryHandoffPath(target: GalleryHandoffPayload["target"]): string {
  if (target === "refine") {
    return "/refine?from=gallery";
  }
  if (target === "inpaint") {
    return "/inpaint?from=gallery";
  }
  if (target === "outpaint") {
    return "/outpaint?from=gallery";
  }
  if (target === "compose") {
    return "/compose?from=gallery";
  }
  if (target === "promptEditor") {
    return "/prompt?from=gallery";
  }
  if (target === "controlnet") {
    return "/controlnet?from=gallery";
  }
  if (target === "video") {
    return "/video?from=gallery";
  }
  return "/image-prompt?from=gallery";
}

export function galleryPromptEditorPathFromHistory(): string {
  return "/prompt?from=history";
}

/** Shared settings slice to apply after a re-edit handoff lands. */
export function sharedPatchFromGalleryHandoff(
  payload: GalleryHandoffPayload,
): {
  sessionActiveLoraIds?: string[];
  queueQualityProfile?: QueueQualityProfile;
} {
  const patch: {
    sessionActiveLoraIds?: string[];
    queueQualityProfile?: QueueQualityProfile;
  } = {};
  if (payload.sessionActiveLoraIds) {
    patch.sessionActiveLoraIds = payload.sessionActiveLoraIds;
  }
  if (
    payload.handoffMode === "reedit" &&
    payload.queueQualityProfile &&
    payload.queueQualityProfile !== "followSettings"
  ) {
    patch.queueQualityProfile = payload.queueQualityProfile;
  }
  return patch;
}
