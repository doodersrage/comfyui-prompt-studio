"use client";

import Link from "next/link";
import RenderRealismHints from "@/components/RenderRealismHints";
import AnatomyGuardHints from "@/components/AnatomyGuardHints";
import QueueQualityProfileHints from "@/components/QueueQualityProfileHints";
import { ChipButton } from "@/components/ui/Field";
import { ToolSection, accentFocusClass } from "@/components/ui/ToolPageShell";
import type { SharedToolSettings } from "@/lib/settings-cache";
import type { DetailLevel } from "@/lib/detail-level";
import {
  MODEL_SAMPLER_PRESET_OPTIONS,
  normalizeModelSamplerPresetTier,
} from "@/lib/model-sampler-defaults";
import {
  RESOLUTION_ORIENTATION_CORE,
  RESOLUTION_ORIENTATION_OPTIONS,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
} from "@/lib/model-resolution-defaults";
import { normalizeQueueQualityProfile } from "@/lib/queue-quality-profile";

const DETAIL_OPTIONS: Array<{ id: DetailLevel; label: string }> = [
  { id: "concise", label: "Concise" },
  { id: "balanced", label: "Balanced" },
  { id: "rich", label: "Rich" },
];

type SettingsPromptQualityPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  freeVramGb?: number | null;
  totalVramGb?: number | null;
};

export default function SettingsPromptQualityPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  freeVramGb,
  totalVramGb,
}: SettingsPromptQualityPanelProps) {
  const detail = sharedSettings.detail ?? "balanced";
  const vramEnabled = sharedSettings.vramGuardEnabled !== false;
  const minFreeGb = sharedSettings.vramGuardMinFreeGb ?? 6;
  const samplerPreset = normalizeModelSamplerPresetTier(
    sharedSettings.modelSamplerPreset,
  );
  const orientation = normalizeResolutionOrientation(
    sharedSettings.modelResolutionOrientation,
  );
  const coreOrientations = RESOLUTION_ORIENTATION_OPTIONS.filter((option) =>
    RESOLUTION_ORIENTATION_CORE.includes(option.id),
  );

  return (
    <>
      <ToolSection id="settings-comfyui-prompt-quality" title="Prompt quality">
        <p className="text-sm text-zinc-400">
          Defaults applied when generating and when queueing to ComfyUI. Tool sidebars
          can still override for a single session.
        </p>

        <div className="space-y-2">
          <p className="type-caption text-zinc-500">Default prompt detail</p>
          <div className="flex flex-wrap gap-1.5">
            {DETAIL_OPTIONS.map((option) => (
              <ChipButton
                key={option.id}
                active={detail === option.id}
                disabled={!sharedMounted}
                onClick={() => updateSharedSettings({ detail: option.id })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-zinc-500">
            Controls LLM length/density budgets (concise / balanced / rich).
          </p>
        </div>

        <div className="space-y-2">
          <p className="type-caption text-zinc-500">Default sampler preset</p>
          <div className="flex flex-wrap gap-1.5">
            {MODEL_SAMPLER_PRESET_OPTIONS.map((option) => (
              <ChipButton
                key={option.id}
                active={samplerPreset === option.id}
                disabled={!sharedMounted}
                title={option.description}
                onClick={() =>
                  updateSharedSettings({ modelSamplerPreset: option.id })
                }
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="type-caption text-zinc-500">Default orientation</p>
          <div className="flex flex-wrap gap-1.5">
            {coreOrientations.map((option) => (
              <ChipButton
                key={option.id}
                active={orientation === option.id}
                disabled={!sharedMounted}
                title={option.description}
                onClick={() =>
                  updateSharedSettings({ modelResolutionOrientation: option.id })
                }
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-zinc-500">
            Extra Qwen ratios remain available in tool sidebars.
          </p>
        </div>

        <RenderRealismHints
          mode={sharedSettings.renderRealismMode ?? "off"}
          onModeChange={(mode) => updateSharedSettings({ renderRealismMode: mode })}
        />
        <AnatomyGuardHints
          mode={sharedSettings.anatomyGuardMode ?? "standard"}
          onModeChange={(mode) => updateSharedSettings({ anatomyGuardMode: mode })}
        />
        <QueueQualityProfileHints
          profile={normalizeQueueQualityProfile(sharedSettings.queueQualityProfile)}
          samplerPreset={samplerPreset}
          resolutionSizeTier={normalizeResolutionSizeTier(
            sharedSettings.modelResolutionSizeTier,
          )}
          onProfileChange={(profile) =>
            updateSharedSettings({
              queueQualityProfile: profile,
              sessionQueueMode: "off",
            })
          }
        />

        <p className="type-caption text-zinc-500">
          Theme and density live in{" "}
          <Link
            href="/profile"
            className="text-[var(--accent-text)] underline-offset-2 hover:underline"
          >
            Profile → Appearance
          </Link>
          .
        </p>
      </ToolSection>

      <ToolSection id="settings-comfyui-vram-guard" title="VRAM Max guard">
        <p className="text-sm text-zinc-400">
          When free VRAM is low, Max enrich automatically downgrades to Final (skips
          neural upscale / peak refiner load).
        </p>
        {typeof freeVramGb === "number" ? (
          <p className="type-caption text-zinc-500">
            ComfyUI now: {freeVramGb.toFixed(1)}
            {typeof totalVramGb === "number" ? ` / ${totalVramGb.toFixed(1)}` : ""} GB free
          </p>
        ) : null}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={vramEnabled}
            disabled={!sharedMounted}
            onChange={(event) =>
              updateSharedSettings({ vramGuardEnabled: event.target.checked })
            }
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass()}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Downgrade Max → Final when VRAM is tight
            </span>
            <span className="block text-xs text-zinc-500">
              Recommended on for 16–24GB cards while other jobs are running.
            </span>
          </span>
        </label>
        <label className="block space-y-2 text-sm">
          <span className="type-caption text-zinc-500">
            Min free VRAM before Max (GB)
          </span>
          <input
            type="number"
            min={1}
            max={48}
            step={0.5}
            disabled={!sharedMounted || !vramEnabled}
            value={minFreeGb}
            onChange={(event) =>
              updateSharedSettings({
                vramGuardMinFreeGb: Number(event.target.value),
              })
            }
            className="ui-input w-full max-w-[10rem]"
          />
        </label>
      </ToolSection>
    </>
  );
}
