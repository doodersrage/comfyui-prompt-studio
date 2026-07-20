"use client";

import { ChipButton } from "@/components/ui/Field";
import {
  formatModelSamplerHint,
  getModelSamplerDefaults,
  MODEL_SAMPLER_PRESET_OPTIONS,
  type ModelSamplerPresetTier,
} from "@/lib/model-sampler-defaults";
import type { ComfyImageModel } from "@/lib/comfy-models";

type ModelSamplerHintsProps = {
  model: ComfyImageModel;
  preset: ModelSamplerPresetTier;
  onPresetChange: (preset: ModelSamplerPresetTier) => void;
};

export default function ModelSamplerHints({
  model,
  preset,
  onPresetChange,
}: ModelSamplerHintsProps) {
  const defaults = getModelSamplerDefaults(model, preset);
  const activeOption =
    MODEL_SAMPLER_PRESET_OPTIONS.find((option) => option.id === preset) ??
    MODEL_SAMPLER_PRESET_OPTIONS[0];

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-sky-200/85">KSampler preset on queue</p>
          <p className="text-xs text-zinc-300">{formatModelSamplerHint(model, preset)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {MODEL_SAMPLER_PRESET_OPTIONS.map((option) => (
            <ChipButton
              key={option.id}
              active={preset === option.id}
              onClick={() => onPresetChange(option.id)}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      </div>
      <p className="mt-2 type-caption text-zinc-500">{activeOption.description}</p>
      <p className="mt-1.5 type-caption text-zinc-500">
        Applied to{" "}
        <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{SEED}}`}</code>
        ,{" "}
        <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{STEPS}}`}</code>
        , and{" "}
        <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{CFG}}`}</code>{" "}
        placeholders, or patched directly into sampler nodes.
        {defaults.fixedSeed == null
          ? " Seed is randomized per job unless you pin one in queue params."
          : null}
      </p>
    </div>
  );
}
