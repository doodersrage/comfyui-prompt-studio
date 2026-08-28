'use client';

import { ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<SettingsComfyConnectionPanelProps, 'settings' | 'updateSettings' | 'setStatus'>;

export function SettingsComfyConnectionAutoImproveSection({
  settings,
  updateSettings,
  setStatus,
}: Props) {
  return (
    <ToolSection id="settings-comfyui-auto-improve" title="Auto-improve on gallery ratings">
      <p className="text-sm text-[var(--text-secondary)]">
        Rating-driven queue actions. Prefer the calm preset if you do not want surprise Max jobs.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            updateSettings({
              autoRequeueFinalOnHighRating: true,
              autoRequeueMaxOnFiveStar: false,
              autoImg2imgRefineOnFiveStar: false,
              autoMutateOnHighRating: false,
              autoSeedExperimentOnHighRating: false,
              autoRefineOnLowRating: true,
            });
            setStatus('Auto-improve preset: calm (Final on 4–5★, Max off).');
          }}
        >
          Calm preset
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            updateSettings({
              autoRequeueFinalOnHighRating: true,
              autoRequeueMaxOnFiveStar: true,
              autoImg2imgRefineOnFiveStar: false,
              autoMutateOnHighRating: false,
              autoSeedExperimentOnHighRating: false,
              autoRefineOnLowRating: true,
            });
            setStatus('Auto-improve preset: aggressive (Final + Max).');
          }}
        >
          Aggressive preset
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            updateSettings({
              autoRequeueFinalOnHighRating: false,
              autoRequeueMaxOnFiveStar: false,
              autoImg2imgRefineOnFiveStar: false,
              autoMutateOnHighRating: false,
              autoSeedExperimentOnHighRating: false,
              autoRefineOnLowRating: false,
            });
            setStatus('Auto-improve disabled.');
          }}
        >
          Off
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoRequeueFinalOnHighRating !== false}
          onChange={event => updateSettings({ autoRequeueFinalOnHighRating: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto improve 4–5★ → Final (upscale / moiré / Lightning re-seed)
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoRequeueMaxOnFiveStar !== false}
          onChange={event => updateSettings({ autoRequeueMaxOnFiveStar: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto improve 5★ → Max
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoImg2imgRefineOnFiveStar === true}
          onChange={event => updateSettings({ autoImg2imgRefineOnFiveStar: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        After 5★ upscale, also queue low-denoise refine (experimental)
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.autoRefineOnLowRating !== false}
          onChange={event => updateSettings({ autoRefineOnLowRating: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Auto-open Refine when rated 1–2★
      </label>
    </ToolSection>
  );
}
