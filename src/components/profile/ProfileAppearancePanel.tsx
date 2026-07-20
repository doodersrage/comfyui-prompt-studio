"use client";

import { useEffect, useState } from "react";
import type { AmbientIntensity } from "@/lib/ambient-settings";
import { loadAmbientIntensity, saveAmbientIntensity } from "@/lib/ambient-settings";
import type { AppTheme } from "@/lib/theme-store";
import { loadAppTheme, saveAppTheme } from "@/lib/theme-store";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { ToolSection } from "@/components/ui/ToolPageShell";

export default function ProfileAppearancePanel() {
  const [ambient, setAmbient] = useState<AmbientIntensity>("normal");
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAmbient(loadAmbientIntensity());
      setTheme(loadAppTheme());
    });
  }, []);

  return (
    <ToolSection title="Appearance">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="type-caption text-zinc-500">Theme</span>
          <select
            value={theme}
            onChange={(event) => {
              const next = event.target.value as AppTheme;
              setTheme(next);
              saveAppTheme(next);
            }}
            className="ui-input w-full"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="type-caption text-zinc-500">Ambient background</span>
          <select
            value={ambient}
            onChange={(event) => {
              const next = event.target.value as AmbientIntensity;
              setAmbient(next);
              saveAmbientIntensity(next);
            }}
            className="ui-input w-full"
          >
            <option value="off">Off</option>
            <option value="subtle">Subtle</option>
            <option value="normal">Normal</option>
            <option value="vivid">Vivid</option>
          </select>
        </label>
      </div>
    </ToolSection>
  );
}
