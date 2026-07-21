"use client";

import { Button } from "@/components/ui/Button";
import { ToolSection } from "@/components/ui/ToolPageShell";
import {
  SETTINGS_BROWSER_PRESETS,
  type SettingsBrowserPreset,
} from "@/lib/settings-presets";

export default function SettingsBrowserPresetsPanel({
  onApply,
  disabled = false,
}: {
  onApply: (preset: SettingsBrowserPreset) => void;
  disabled?: boolean;
}) {
  return (
    <ToolSection
      id="settings-comfyui-presets"
      title="Browser presets"
      description="One-click bundles for queue quality, Hold Max, VRAM guard, and gallery auto-improve."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {SETTINGS_BROWSER_PRESETS.map((preset) => (
          <div
            key={preset.id}
            className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-4"
          >
            <div className="space-y-1">
              <p className="type-heading text-zinc-100">{preset.label}</p>
              <p className="type-caption text-zinc-500">{preset.description}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onApply(preset)}
              className="mt-auto"
            >
              Apply {preset.label}
            </Button>
          </div>
        ))}
      </div>
    </ToolSection>
  );
}
