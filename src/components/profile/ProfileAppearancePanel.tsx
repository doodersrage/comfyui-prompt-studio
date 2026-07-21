"use client";

import { useEffect, useState } from "react";
import type { AmbientIntensity } from "@/lib/ambient-settings";
import { loadAmbientIntensity, saveAmbientIntensity } from "@/lib/ambient-settings";
import type { AppTheme } from "@/lib/theme-store";
import { loadAppTheme, saveAppTheme } from "@/lib/theme-store";
import type { UiDensity } from "@/lib/density-settings";
import { loadUiDensity, saveUiDensity } from "@/lib/density-settings";
import {
  loadToastPreferenceEnabled,
  rememberToastPreference,
} from "@/lib/app-toast";
import { resetUiChrome } from "@/lib/reset-ui-chrome";
import { pushAppToast } from "@/lib/app-toast";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { Button } from "@/components/ui/Button";
import { ToolSection } from "@/components/ui/ToolPageShell";

export default function ProfileAppearancePanel() {
  const [ambient, setAmbient] = useState<AmbientIntensity>("subtle");
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [density, setDensity] = useState<UiDensity>("comfortable");
  const [toastsEnabled, setToastsEnabled] = useState(true);
  const [resetNote, setResetNote] = useState<string | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAmbient(loadAmbientIntensity());
      setTheme(loadAppTheme());
      setDensity(loadUiDensity());
      setToastsEnabled(loadToastPreferenceEnabled());
    });
  }, []);

  return (
    <ToolSection title="Appearance">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Theme</span>
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
          <span className="type-caption text-[var(--text-muted)]">Ambient background</span>
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
        <label className="space-y-2 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Density</span>
          <select
            value={density}
            onChange={(event) => {
              const next = event.target.value as UiDensity;
              setDensity(next);
              saveUiDensity(next);
            }}
            className="ui-input w-full"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={toastsEnabled}
          onChange={(event) => {
            const next = event.target.checked;
            setToastsEnabled(next);
            rememberToastPreference(next);
            if (next) {
              pushAppToast({ text: "Toasts enabled", tone: "info", ttlMs: 2500 });
            }
          }}
        />
        <span>
          <span className="block font-medium text-[var(--text-primary)]">Queue toasts</span>
          <span className="type-caption text-[var(--text-muted)]">
            Show bottom-right confirmations for ComfyUI queue success and failures.
          </span>
        </span>
      </label>

      <div className="mt-6 space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <p className="type-heading">Reset chrome</p>
        <p className="type-caption text-[var(--text-muted)]">
          Clears pinned tools, recent destinations, expanded nav groups, remembered
          collapsibles, per-tool model/workflow memory, last draft, and last tool route.
          Density returns to Comfortable. Theme, ambient, and toast preference stay unchanged.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (
              !window.confirm(
                "Reset pins, recent destinations, nav expand state, collapsibles, per-tool model memory, last draft, and last tool route?",
              )
            ) {
              return;
            }
            resetUiChrome();
            setDensity("comfortable");
            setResetNote("Chrome reset. Reload if the sidebar still looks stale.");
            if (toastsEnabled) {
              pushAppToast({
                text: "UI chrome reset",
                tone: "info",
              });
            }
          }}
        >
          Reset chrome
        </Button>
        {resetNote ? (
          <p className="type-caption text-[var(--tint-info-text)]">{resetNote}</p>
        ) : null}
      </div>
    </ToolSection>
  );
}
