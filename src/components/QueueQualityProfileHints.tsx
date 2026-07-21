"use client";

import { useState } from "react";
import { ChipButton } from "@/components/ui/Field";
import { useHeldMaxCount } from "@/hooks/useHeldMaxJobs";
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from "@/lib/model-sampler-defaults";
import {
  normalizeResolutionSizeTier,
  type ResolutionSizeTier,
} from "@/lib/model-resolution-defaults";
import {
  formatQueuePipelineStatusNotes,
  formatQueueQualityProfileHint,
  QUEUE_QUALITY_PROFILE_OPTIONS,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from "@/lib/queue-quality-profile";
import { resolveUpscaleModelFilename } from "@/lib/model-upscale-map";
import {
  loadSettingsCache,
  saveSharedSettings,
} from "@/lib/settings-cache";
import { rememberedSamplerOverrides } from "@/lib/sampler-memory";
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
  const [settingsTick, setSettingsTick] = useState(0);
  void settingsTick;
  const heldCount = useHeldMaxCount();
  const shared = loadSettingsCache().shared;
  const neuralUpscaleAvailable = Boolean(
    resolveUpscaleModelFilename(shared.model, { upscaleMap: shared.modelUpscaleMap }),
  );
  const effectiveProfile = resolveQueueQualityProfile({
    global: profile,
    model: shared.model,
  });
  const hintOptions = { neuralUpscaleAvailable, model: shared.model };
  const activeOption =
    QUEUE_QUALITY_PROFILE_OPTIONS.find((option) => option.id === profile) ??
    QUEUE_QUALITY_PROFILE_OPTIONS[0];
  const effectiveGlobal = formatQueueQualityProfileHint(
    effectiveProfile,
    normalizeModelSamplerPresetTier(samplerPreset),
    normalizeResolutionSizeTier(resolutionSizeTier),
    hintOptions,
  );
  const draftBumped =
    profile === "draft" &&
    effectiveProfile === "final" &&
    (/^qwen-rapid-aio-/i.test(shared.model) ||
      /^qwen-image-2512$/i.test(shared.model));
  const hasSamplerMemory =
    Object.keys(rememberedSamplerOverrides(shared.model)).length > 0;
  const pipelinePreview = formatQueuePipelineStatusNotes({
    model: shared.model,
    qualityProfile: effectiveProfile,
    tool: toolId,
    samplerMemory: hasSamplerMemory,
  });
  const sessionMode = shared.sessionQueueMode ?? "off";
  const effectiveForTool = toolId
    ? formatQueueQualityProfileHint(
        resolveQueueQualityProfile({
          tool: toolId,
          global: profile,
          toolProfiles: toolProfile ? { [toolId]: toolProfile } : undefined,
          model: shared.model,
        }),
        normalizeModelSamplerPresetTier(samplerPreset),
        normalizeResolutionSizeTier(resolutionSizeTier),
        hintOptions,
      )
    : null;

  function setSessionMode(mode: "iterate" | "keeper" | "off") {
    const next = loadSettingsCache().shared;
    saveSharedSettings({ ...next, sessionQueueMode: mode });
    setSettingsTick((value) => value + 1);
  }

  function handleProfileChange(next: QueueQualityProfile) {
    if (next === "draft") {
      setSessionMode("iterate");
    } else if (next === "final") {
      setSessionMode("keeper");
    } else {
      setSessionMode("off");
    }
    onProfileChange(next);
  }

  function handleSessionMode(mode: "iterate" | "keeper") {
    setSessionMode(mode);
    onProfileChange(mode === "iterate" ? "draft" : "final");
  }

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

        <div className="space-y-1.5">
          <p className="type-caption text-violet-200/70">Session mode</p>
          <div className="grid min-w-0 grid-cols-2 gap-1.5">
            <ChipButton
              active={sessionMode === "iterate" || profile === "draft"}
              onClick={() => handleSessionMode("iterate")}
              className="w-full justify-center px-2"
            >
              Iterate
            </ChipButton>
            <ChipButton
              active={sessionMode === "keeper" || profile === "final"}
              onClick={() => handleSessionMode("keeper")}
              className="w-full justify-center px-2"
            >
              Keeper
            </ChipButton>
          </div>
          <p className="type-caption text-zinc-500">
            {draftBumped
              ? "Iterate → Draft (queues as Final for polish/Base on this model). Keeper → Final. Max stays separate."
              : "Iterate → Draft for fast loops. Keeper → Final for keepers. Max stays a separate quality chip."}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {QUEUE_QUALITY_PROFILE_OPTIONS.map((option) => (
            <ChipButton
              key={option.id}
              active={profile === option.id}
              onClick={() => handleProfileChange(option.id)}
              className="w-full justify-center px-2"
            >
              {option.id === "draft" && draftBumped
                ? "Draft → Final"
                : option.label}
            </ChipButton>
          ))}
        </div>

        {pipelinePreview.length > 0 || heldCount > 0 ? (
          <div className="space-y-1.5">
            <p className="type-caption text-violet-200/70">Pipeline preview</p>
            <div className="flex flex-wrap gap-1.5">
              {pipelinePreview.map((note) => (
                <span
                  key={note}
                  className="rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-100/90"
                >
                  {note}
                </span>
              ))}
              {heldCount > 0 ? (
                <a
                  href="/queue"
                  className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100/90 transition hover:border-amber-300/50 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  {heldCount} Max held
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ChipButton
            active={shared.holdMaxUntilIdle === true}
            onClick={() => {
              const next = loadSettingsCache().shared;
              saveSharedSettings({
                ...next,
                holdMaxUntilIdle: next.holdMaxUntilIdle !== true,
              });
              setSettingsTick((value) => value + 1);
            }}
          >
            Hold Max until idle
          </ChipButton>
          {shared.holdMaxUntilIdle ? (
            <span className="type-caption text-zinc-500">
              Max waits for an empty ComfyUI queue
            </span>
          ) : null}
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
        {/^qwen-rapid-aio-/i.test(shared.model) ? (
          <>
            Rapid AIO: Draft queues as Final so moiré polish runs. Max uses 10-step sgm_uniform
            plus short anti-moiré cues; Final uses soft blur only, Max adds a mild bicubic
            resample. Output upscale is skipped (it re-amplifies screen-door).
          </>
        ) : /lightning-(4|8)\b/i.test(shared.model) ? (
          <>
            Lightning: CFG-1 short negatives. Sidebar ARs stick to 1:1 / 3:4 / 4:3 (extreme
            9:16/16:9 softens). Final/Max add Lanczos on native 2512 Lightning — Draft stays
            native. Edit Lightning T2I skips Lanczos. Gallery Upscale/Refine are disabled —
            re-queue with a new seed instead.
          </>
        ) : /^qwen-image-2512$/i.test(shared.model) ? (
          <>
            Vanilla 2512: Draft queues as Final. Final uses Lanczos (chroma guard — skips neural
            4×); Max may still run neural upscale. Soft latent detail denoise is tuned milder
            than Flux.
          </>
        ) : (
          <>
            Draft favors speed; Final and Max bump sampler steps and resolution. Flux/vanilla
            Qwen Final/Max may insert a soft latent detail pass; SDXL may insert a refiner.
            When an upscale model is mapped, Final/Max run{" "}
            <span className="text-zinc-400">UpscaleModel</span> then area-scale to ~1.25×/1.5×
            (Max may add Lanczos polish + opt-in sharpen); otherwise Lanczos{" "}
            <span className="text-zinc-400">ImageScale</span> before SaveImage.
          </>
        )}
      </p>
    </div>
  );
}
