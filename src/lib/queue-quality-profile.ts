import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from "./model-sampler-defaults";
import {
  normalizeResolutionSizeTier,
  type ResolutionSizeTier,
} from "./model-resolution-defaults";
import { loadSettingsCache } from "./settings-cache";

export type QueueQualityProfile =
  | "followSettings"
  | "draft"
  | "final"
  | "max";

export const DEFAULT_QUEUE_QUALITY_PROFILE: QueueQualityProfile = "followSettings";

export const QUEUE_QUALITY_PROFILE_OPTIONS: {
  id: QueueQualityProfile;
  label: string;
  description: string;
}[] = [
  {
    id: "followSettings",
    label: "Follow sidebar",
    description: "Use the KSampler preset and resolution chips above as-is.",
  },
  {
    id: "draft",
    label: "Draft",
    description: "Fast iteration — base sampler tier, medium-or-smaller resolution.",
  },
  {
    id: "final",
    label: "Final",
    description: "Production renders — at least Optimized sampler, medium-or-larger resolution.",
  },
  {
    id: "max",
    label: "Max",
    description: "Best quality — Max compatible sampler and largest safe resolution.",
  },
];

const SAMPLER_TIER_ORDER: ModelSamplerPresetTier[] = [
  "base",
  "optimized",
  "maxCompatible",
  "max",
];

const RESOLUTION_TIER_ORDER: ResolutionSizeTier[] = ["small", "medium", "max"];

function samplerTierRank(tier: ModelSamplerPresetTier): number {
  return SAMPLER_TIER_ORDER.indexOf(tier);
}

function resolutionTierRank(tier: ResolutionSizeTier): number {
  return RESOLUTION_TIER_ORDER.indexOf(tier);
}

export function normalizeQueueQualityProfile(
  value: unknown,
): QueueQualityProfile {
  if (
    value === "followSettings" ||
    value === "draft" ||
    value === "final" ||
    value === "max"
  ) {
    return value;
  }
  return DEFAULT_QUEUE_QUALITY_PROFILE;
}

export function resolveEffectiveSamplerPreset(
  userPreset: ModelSamplerPresetTier | undefined,
  profile: QueueQualityProfile | undefined,
): ModelSamplerPresetTier {
  const user = normalizeModelSamplerPresetTier(userPreset);
  const mode = normalizeQueueQualityProfile(profile);

  if (mode === "followSettings") {
    return user;
  }
  if (mode === "draft") {
    return "base";
  }
  if (mode === "final") {
    return SAMPLER_TIER_ORDER[
      Math.max(samplerTierRank(user), samplerTierRank("optimized"))
    ]!;
  }
  return SAMPLER_TIER_ORDER[
    Math.max(samplerTierRank(user), samplerTierRank("maxCompatible"))
  ]!;
}

export function resolveEffectiveResolutionSizeTier(
  userTier: ResolutionSizeTier | undefined,
  profile: QueueQualityProfile | undefined,
): ResolutionSizeTier {
  const user = normalizeResolutionSizeTier(userTier);
  const mode = normalizeQueueQualityProfile(profile);

  if (mode === "followSettings") {
    return user;
  }
  if (mode === "draft") {
    return RESOLUTION_TIER_ORDER[
      Math.min(resolutionTierRank(user), resolutionTierRank("medium"))
    ]!;
  }
  if (mode === "final") {
    return RESOLUTION_TIER_ORDER[
      Math.max(resolutionTierRank(user), resolutionTierRank("medium"))
    ]!;
  }
  return "max";
}

export function formatQueueQualityProfileLabel(
  profile: QueueQualityProfile | undefined,
): string {
  if (!profile || profile === "followSettings") {
    return "Follow sidebar";
  }
  return (
    QUEUE_QUALITY_PROFILE_OPTIONS.find((entry) => entry.id === profile)?.label ??
    profile
  );
}
export function formatQueueQualityProfileHint(
  profile: QueueQualityProfile,
  userPreset: ModelSamplerPresetTier,
  userSizeTier: ResolutionSizeTier,
  options?: { neuralUpscaleAvailable?: boolean },
): string | null {
  if (profile === "followSettings") {
    return null;
  }

  const effectivePreset = resolveEffectiveSamplerPreset(userPreset, profile);
  const effectiveSize = resolveEffectiveResolutionSizeTier(userSizeTier, profile);
  const option =
    QUEUE_QUALITY_PROFILE_OPTIONS.find((entry) => entry.id === profile) ??
    QUEUE_QUALITY_PROFILE_OPTIONS[0];
  const upscaleNote = profileUsesUpscaleEnrich(profile)
    ? options?.neuralUpscaleAvailable
      ? profileUsesNeuralUpscalePolish(profile)
        ? " · UpscaleModel + Lanczos polish"
        : " · UpscaleModel upscale"
      : " · Lanczos upscale"
    : "";
  const refinerNote =
    profileUsesSdxlRefinerEnrich(profile) ? " · SDXL refiner pass" : "";
  const sharpenNote =
    profileUsesSharpenAfterUpscale(profile) ? " · subtle sharpen" : "";

  return `${option.label} queue → ${effectivePreset} sampler · ${effectiveSize} resolution${upscaleNote}${refinerNote}${sharpenNote} (sidebar: ${userPreset} · ${userSizeTier}).`;
}

export function resolveQueueQualityProfile(input: {
  tool?: string;
  override?: QueueQualityProfile;
  global?: QueueQualityProfile;
  toolProfiles?: Partial<Record<string, QueueQualityProfile>>;
}): QueueQualityProfile {
  if (input.override) {
    return normalizeQueueQualityProfile(input.override);
  }
  const tool = input.tool?.trim();
  if (tool && input.toolProfiles?.[tool]) {
    return normalizeQueueQualityProfile(input.toolProfiles[tool]);
  }
  return normalizeQueueQualityProfile(input.global);
}

export function profileUsesUpscaleEnrich(profile: QueueQualityProfile | undefined): boolean {
  const mode = normalizeQueueQualityProfile(profile);
  return mode === "final" || mode === "max";
}

export function upscaleScaleForProfile(profile: QueueQualityProfile | undefined): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 1.5 : 1.25;
}

/** Small Lanczos pass chained after neural UpscaleModel on Max profile. */
export function lanczosPolishScaleAfterNeural(): number {
  return 1.05;
}

export function profileUsesNeuralUpscalePolish(
  profile: QueueQualityProfile | undefined,
): boolean {
  return normalizeQueueQualityProfile(profile) === "max";
}

export function profileUsesSdxlRefinerEnrich(
  profile: QueueQualityProfile | undefined,
): boolean {
  const mode = normalizeQueueQualityProfile(profile);
  return mode === "final" || mode === "max";
}

export function sdxlRefinerLatentScaleForProfile(
  profile: QueueQualityProfile | undefined,
): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 1.5 : 1.25;
}

export function sdxlRefinerDenoiseForProfile(
  profile: QueueQualityProfile | undefined,
): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 0.3 : 0.22;
}

/** Tiled neural upscale on Max reduces VRAM spikes on large outputs (0 = no tiling). */
export function neuralUpscaleTileSizeForProfile(
  profile: QueueQualityProfile | undefined,
): number {
  if (normalizeQueueQualityProfile(profile) !== "max") {
    return 0;
  }
  const override = loadSettingsCache().shared.neuralUpscaleTileSize;
  if (typeof override === "number" && override >= 0) {
    return override;
  }
  return 512;
}

export function profileUsesSharpenAfterUpscale(
  profile: QueueQualityProfile | undefined,
): boolean {
  return normalizeQueueQualityProfile(profile) === "max";
}

export function sharpenAlphaForProfile(
  profile: QueueQualityProfile | undefined,
): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 0.1 : 0.08;
}
