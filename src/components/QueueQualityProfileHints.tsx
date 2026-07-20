"use client";

import { ChipButton } from "@/components/ui/Field";
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from "@/lib/model-sampler-defaults";
import {
  normalizeResolutionSizeTier,
  type ResolutionSizeTier,
} from "@/lib/model-resolution-defaults";
import {
  formatQueueQualityProfileHint,
  QUEUE_QUALITY_PROFILE_OPTIONS,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from "@/lib/queue-quality-profile";
import { resolveUpscaleModelFilename } from "@/lib/model-upscale-map";
import { loadSettingsCache } from "@/lib/settings-cache";
import { toolQueueQualityLabel } from "@/lib/tool-quality-profiles";

type QueueQualityProfileHintsProps = {
  profile: QueueQualityProfile;
  samplerPreset: ModelSamplerPresetTier;
  resolutionSizeTier: ResolutionSizeTier;
  onProfileChange: (profile: QueueQualityProfile) => void;
  toolId?: string;
  toolProfile?: QueueQualityProfile;
  onToolProfileChange?: (profile: QueueQualityProfile | undefined) => void;
};

export default function QueueQualityProfileHints({
  profile,
  samplerPreset,
  resolutionSizeTier,
  onProfileChange,
  toolId,
  toolProfile,
  onToolProfileChange,
}: QueueQualityProfileHintsProps) {
  const shared = loadSettingsCache().shared;
  const neuralUpscaleAvailable = Boolean(
    resolveUpscaleModelFilename(shared.model, { upscaleMap: shared.modelUpscaleMap }),
  );
  const hintOptions = { neuralUpscaleAvailable };
  const activeOption =
    QUEUE_QUALITY_PROFILE_OPTIONS.find((option) => option.id === profile) ??
    QUEUE_QUALITY_PROFILE_OPTIONS[0];
  const effectiveGlobal = formatQueueQualityProfileHint(
    profile,
    normalizeModelSamplerPresetTier(samplerPreset),
    normalizeResolutionSizeTier(resolutionSizeTier),
    hintOptions,
  );
  const effectiveForTool = toolId
    ? formatQueueQualityProfileHint(
        resolveQueueQualityProfile({
          tool: toolId,
          global: profile,
          toolProfiles: toolProfile ? { [toolId]: toolProfile } : undefined,
        }),
        normalizeModelSamplerPresetTier(samplerPreset),
        normalizeResolutionSizeTier(resolutionSizeTier),
        hintOptions,
      )
    : null;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2.5">
      <div className="space-y-3">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-violet-200/85">Queue quality profile</p>
          <p className="break-words text-xs text-zinc-300">
            {effectiveGlobal ??
              "Uses sidebar KSampler preset and resolution settings when queueing."}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {QUEUE_QUALITY_PROFILE_OPTIONS.map((option) => (
            <ChipButton
              key={option.id}
              active={profile === option.id}
              onClick={() => onProfileChange(option.id)}
              className="w-full justify-center px-2"
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {toolId && onToolProfileChange ? (
        <div className="mt-3 space-y-2 border-t border-violet-500/10 pt-3">
          <p className="type-caption text-violet-200/75">
            {toolQueueQualityLabel(toolId)} override
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-1.5">
            <ChipButton
              active={!toolProfile}
              onClick={() => onToolProfileChange(undefined)}
              className="w-full justify-center px-2"
            >
              Use global
            </ChipButton>
            {QUEUE_QUALITY_PROFILE_OPTIONS.filter(
              (option) => option.id !== "followSettings",
            ).map((option) => (
              <ChipButton
                key={`tool-${option.id}`}
                active={toolProfile === option.id}
                onClick={() => onToolProfileChange(option.id)}
                className="w-full justify-center px-2"
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          {effectiveForTool && toolProfile ? (
            <p className="type-caption text-zinc-500">{effectiveForTool}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 type-caption text-zinc-500">{activeOption.description}</p>
      <p className="mt-1.5 type-caption text-zinc-500">
        Draft favors speed; Final and Max bump sampler steps and resolution. SDXL Final/Max may
        insert a latent upscale + refiner pass. When an upscale model is mapped, Final/Max use{" "}
        <span className="text-zinc-400">UpscaleModel</span> (Max adds Lanczos polish); otherwise
        Lanczos <span className="text-zinc-400">ImageScale</span> before SaveImage.
      </p>
    </div>
  );
}
