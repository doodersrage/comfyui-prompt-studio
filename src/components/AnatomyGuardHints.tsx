"use client";

import { ChipButton } from "@/components/ui/Field";
import {
  ANATOMY_GUARD_OPTIONS,
  formatAnatomyGuardHint,
  type AnatomyGuardMode,
} from "@/lib/anatomy-guard";

type AnatomyGuardHintsProps = {
  mode: AnatomyGuardMode;
  onModeChange: (mode: AnatomyGuardMode) => void;
};

export default function AnatomyGuardHints({
  mode,
  onModeChange,
}: AnatomyGuardHintsProps) {
  const activeOption =
    ANATOMY_GUARD_OPTIONS.find((option) => option.id === mode) ??
    ANATOMY_GUARD_OPTIONS[0];

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-sky-200/85">Anatomy guard on queue</p>
          <p className="text-xs text-zinc-300">{formatAnatomyGuardHint(mode)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {ANATOMY_GUARD_OPTIONS.map((option) => (
            <ChipButton
              key={option.id}
              active={mode === option.id}
              onClick={() => onModeChange(option.id)}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      </div>
      <p className="mt-2 type-caption text-zinc-500">{activeOption.description}</p>
      <p className="mt-1.5 type-caption text-zinc-500">
        Adds anti-mutation and anti–extra-limb terms when you Send to ComfyUI or copy a
        prompt pair. Works alongside render realism; Flux models get anatomy cues in the
        positive prompt.
      </p>
    </div>
  );
}
