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
  options?: { neuralUpscaleAvailable?: boolean; model?: string },
): string | null {
  if (profile === "followSettings") {
    return null;
  }

  const effectivePreset = resolveEffectiveSamplerPreset(userPreset, profile);
  const effectiveSize = resolveEffectiveResolutionSizeTier(userSizeTier, profile);
  const option =
    QUEUE_QUALITY_PROFILE_OPTIONS.find((entry) => entry.id === profile) ??
    QUEUE_QUALITY_PROFILE_OPTIONS[0];
  const model = options?.model?.trim() ?? "";
  const isRapid = /^qwen-rapid-aio-/i.test(model);
  const isLightning = /lightning-(4|8)\b/i.test(model);

  let upscaleNote = "";
  if (isRapid) {
    upscaleNote =
      profile === "final" || profile === "max"
        ? profile === "max"
          ? " · moiré polish (blur + mild resample) · no output upscale"
          : " · moiré polish (soft blur) · no output upscale"
        : "";
  } else if (isLightning) {
    upscaleNote =
      profile === "final" || profile === "max"
        ? " · Lanczos polish · CFG-1 short negatives"
        : " · CFG-1 short negatives";
  } else if (profileUsesUpscaleEnrich(profile)) {
    upscaleNote = options?.neuralUpscaleAvailable
      ? profileUsesNeuralUpscalePolish(profile)
        ? " · UpscaleModel + Lanczos polish"
        : " · UpscaleModel upscale"
      : " · Lanczos upscale";
  }

  const refinerNote =
    !isRapid && !isLightning && profileUsesSdxlRefinerEnrich(profile)
      ? " · SDXL refiner pass"
      : "";
  const sharpenNote =
    !isRapid && !isLightning && profileUsesSharpenAfterUpscale(profile)
      ? " · subtle sharpen"
      : "";

  return `${option.label} queue → ${effectivePreset} sampler · ${effectiveSize} resolution${upscaleNote}${refinerNote}${sharpenNote} (sidebar: ${userPreset} · ${userSizeTier}).`;
}

export function resolveQueueQualityProfile(input: {
  tool?: string;
  override?: QueueQualityProfile;
  global?: QueueQualityProfile;
  toolProfiles?: Partial<Record<string, QueueQualityProfile>>;
  /** When set, Rapid AIO Draft is promoted to Final so moiré polish always runs. */
  model?: string;
}): QueueQualityProfile {
  if (input.override) {
    return normalizeQueueQualityProfile(input.override);
  }
  const tool = input.tool?.trim();
  let profile =
    tool && input.toolProfiles?.[tool]
      ? normalizeQueueQualityProfile(input.toolProfiles[tool])
      : normalizeQueueQualityProfile(input.global);

  // Rapid AIO moiré polish only runs on Final/Max — bump Draft so Generate stays clean.
  if (
    input.model &&
    /^qwen-rapid-aio-/i.test(String(input.model).trim()) &&
    profile === "draft"
  ) {
    return "final";
  }

  return profile;
}

/**
 * Short queue-status chips for the result panel (moiré polish, upscale skip, etc.).
 * Pure client-side — does not require API enrich change plumbing.
 */
export function formatQueuePipelineStatusNotes(input: {
  model?: string;
  qualityProfile?: QueueQualityProfile;
  tool?: string;
}): string[] {
  const model = String(input.model ?? "").trim();
  const profile = normalizeQueueQualityProfile(input.qualityProfile);
  const notes: string[] = [];

  if (profile === "final" || profile === "max" || profile === "draft") {
    notes.push(`${profile} quality`);
  }

  if (/^qwen-rapid-aio-/i.test(model)) {
    if (profileUsesRapidAioMoirePolish(profile, { model })) {
      notes.push("moiré polish on");
      notes.push("upscale skipped (Rapid AIO)");
    } else {
      notes.push("moiré polish off (use Final/Max)");
    }
  } else if (/lightning-(4|8)\b/i.test(model)) {
    notes.push("Lightning CFG-1 · short negatives");
  }

  if (
    /qwen-image-edit-2511-lightning/i.test(model) &&
    (!input.tool ||
      /generate|format|topics|variations|character|pet|fantasy|duo|background/i.test(
        input.tool,
      ))
  ) {
    notes.push("Edit Lightning T2I · refs disconnected");
  }

  return notes;
}

export function profileUsesUpscaleEnrich(profile: QueueQualityProfile | undefined): boolean {
  const mode = normalizeQueueQualityProfile(profile);
  return mode === "final" || mode === "max";
}

export function upscaleScaleForProfile(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string },
): number {
  const mode = normalizeQueueQualityProfile(profile);
  // Lightning: Lanczos is fine on a clean native generate; earlier grain was bad CFG/LoRA/shift.
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return mode === "max" ? 1.28 : 1.18;
  }
  return mode === "max" ? 1.5 : 1.25;
}

/** Lightning Final/Max use Lanczos now that native generate is clean. */
export function upscaleMethodForProfile(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string },
): "lanczos" | "area" | "bilinear" {
  void profile;
  void options;
  return "lanczos";
}

/** Neural UpscaleModel + Lanczos polish amplify texture on Lightning — use soft ImageScaleBy only. */
export function profileUsesNeuralUpscaleEnrich(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string },
): boolean {
  if (!profileUsesUpscaleEnrich(profile)) {
    return false;
  }
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return false;
  }
  return true;
}

/** Small Lanczos pass chained after neural UpscaleModel on Max profile. */
export function lanczosPolishScaleAfterNeural(
  options?: { model?: string },
): number {
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return 1;
  }
  return 1.05;
}

export function profileUsesNeuralUpscalePolish(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string },
): boolean {
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return false;
  }
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

/** Lightning Final/Max used to add Lanczos + soft sharpen; that diverges from
 * native ComfyUI and often shows as halos/grain. Keep polish off by default. */
export function profileUsesLightningUpscalePolish(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string },
): boolean {
  void profile;
  void options;
  return false;
}

export function lightningUpscalePolishAlpha(
  profile: QueueQualityProfile | undefined,
): number {
  // Lanczos already restores edge clarity — keep polish light so skin/hair stay natural.
  return normalizeQueueQualityProfile(profile) === "max" ? 0.045 : 0.03;
}

export function lightningUpscalePolishSigma(
  profile: QueueQualityProfile | undefined,
): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 0.7 : 0.75;
}

export function sharpenAlphaForProfile(
  profile: QueueQualityProfile | undefined,
): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 0.1 : 0.08;
}

/**
 * Rapid AIO often shows mild moiré / screen-door texture. A soft ImageBlur
 * after decode (Final/Max) knocks that down without looking soft-focus.
 */
export function profileUsesRapidAioMoirePolish(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string },
): boolean {
  const model = options?.model?.trim() ?? "";
  if (!/^qwen-rapid-aio-/i.test(model)) {
    return false;
  }
  const normalized = normalizeQueueQualityProfile(profile);
  return normalized === "final" || normalized === "max";
}

export function rapidAioMoireBlurRadius(
  profile: QueueQualityProfile | undefined,
): number {
  return normalizeQueueQualityProfile(profile) === "max" ? 1 : 1;
}

export function rapidAioMoireBlurSigma(
  profile: QueueQualityProfile | undefined,
): number {
  // Final stays soft-blur only (no resample) — stronger blur was mushy without helping moiré.
  return normalizeQueueQualityProfile(profile) === "max" ? 0.55 : 0.45;
}

/**
 * Whether Rapid AIO polish includes a downsample→restore resample.
 * Final skips it (blur only) — area↓/lanczos↑ looked pixelated when gallery-scaled.
 * Max keeps a mild bicubic pass for stubborn screen-door.
 */
export function profileUsesRapidAioMoireResample(
  profile: QueueQualityProfile | undefined,
): boolean {
  return normalizeQueueQualityProfile(profile) === "max";
}

/**
 * Mild bicubic downsample factor for Rapid AIO Max anti-moiré.
 * Paired with inverse Lanczos restore; Final does not resample.
 */
export function rapidAioMoireDownscaleFactor(
  profile: QueueQualityProfile | undefined,
): number {
  return profileUsesRapidAioMoireResample(profile) ? 0.9 : 1;
}

export function rapidAioMoireDownscaleMethod(
  profile: QueueQualityProfile | undefined,
): "bicubic" | "area" | "lanczos" {
  void profile;
  // Bicubic preserves micro-detail better than area (which block-averages → pixelation).
  return "bicubic";
}

export function rapidAioMoireRestoreScale(
  profile: QueueQualityProfile | undefined,
): number {
  const down = rapidAioMoireDownscaleFactor(profile);
  if (down >= 0.999) {
    return 1;
  }
  return Math.round((1 / down) * 1000) / 1000;
}

/** Soft edge recovery after Max resample — lighter than generic Max sharpen. */
export function rapidAioMoireRestoreSharpenAlpha(
  profile: QueueQualityProfile | undefined,
): number {
  return profileUsesRapidAioMoireResample(profile) ? 0.04 : 0;
}
