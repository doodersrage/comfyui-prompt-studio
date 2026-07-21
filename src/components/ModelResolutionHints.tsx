"use client";

import { ChipButton } from "@/components/ui/Field";
import {
  formatModelResolutionHint,
  getModelResolutionPreset,
  RESOLUTION_ORIENTATION_OPTIONS,
  RESOLUTION_SIZE_TIER_OPTIONS,
  resolutionOrientationsForModel,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from "@/lib/model-resolution-defaults";
import type { ComfyImageModel } from "@/lib/comfy-models/client";

type ModelResolutionHintsProps = {
  model: ComfyImageModel;
  orientation: ResolutionOrientation;
  sizeTier: ResolutionSizeTier;
  onOrientationChange: (orientation: ResolutionOrientation) => void;
  onSizeTierChange: (tier: ResolutionSizeTier) => void;
};

export default function ModelResolutionHints({
  model,
  orientation,
  sizeTier,
  onOrientationChange,
  onSizeTierChange,
}: ModelResolutionHintsProps) {
  const preset = getModelResolutionPreset(model, orientation, sizeTier);
  const activeTier =
    RESOLUTION_SIZE_TIER_OPTIONS.find((option) => option.id === sizeTier) ??
    RESOLUTION_SIZE_TIER_OPTIONS[1];
  const allowedOrientations = new Set(resolutionOrientationsForModel(model));
  const orientationOptions = RESOLUTION_ORIENTATION_OPTIONS.filter((option) =>
    allowedOrientations.has(option.id),
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2.5">
      <div className="space-y-3">
        <div className="min-w-0 space-y-2">
          <div className="min-w-0 space-y-1">
            <p className="type-caption text-violet-200/85">Resolution preset on queue</p>
            <p className="break-words text-xs text-zinc-300">
              {formatModelResolutionHint(model, orientation, sizeTier)}
            </p>
          </div>
          <div
            className={`grid min-w-0 gap-1.5 ${
              orientationOptions.length > 3
                ? "grid-cols-3 sm:grid-cols-4"
                : "grid-cols-3"
            }`}
          >
            {orientationOptions.map((option) => (
              <ChipButton
                key={option.id}
                active={orientation === option.id}
                onClick={() => onOrientationChange(option.id)}
                className="w-full justify-center px-2"
                title={option.description}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <p className="type-caption break-words text-zinc-500">
            {activeTier.description} · {preset.width}×{preset.height}px
          </p>
          <div className="grid min-w-0 grid-cols-3 gap-1.5">
            {RESOLUTION_SIZE_TIER_OPTIONS.map((option) => (
              <ChipButton
                key={option.id}
                active={sizeTier === option.id}
                onClick={() => onSizeTierChange(option.id)}
                className="w-full justify-center px-2"
                title={option.description}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 type-caption break-words text-zinc-500">
        Applied to{" "}
        <code className="rounded bg-zinc-900/80 px-1 text-violet-200/90">{`{{WIDTH}}`}</code> and{" "}
        <code className="rounded bg-zinc-900/80 px-1 text-violet-200/90">{`{{HEIGHT}}`}</code>{" "}
        workflow placeholders unless advanced queue params override them.
      </p>
    </div>
  );
}
