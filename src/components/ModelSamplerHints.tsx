'use client';

import { useState } from 'react';
import { ChipButton, FieldLabel } from '@/components/ui/Field';
import {
  formatKleinSamplerPeopleHint,
  formatModelSamplerHint,
  formatWanVideoSamplerHint,
  getModelSamplerDefaults,
  hasModelSamplerOverrides,
  MODEL_SAMPLER_PRESET_OPTIONS,
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import { formatModelSamplingHint } from '@/lib/model-sampling-patch';
import type { ComfyImageModel } from '@/lib/comfy-models/client';

type OverrideFieldKey = keyof ModelSamplerOverrideFields;

const OVERRIDE_FIELDS: { key: OverrideFieldKey; label: string; placeholder?: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'cfg', label: 'CFG' },
  { key: 'denoise', label: 'Denoise', placeholder: 'auto' },
  { key: 'samplerName', label: 'Sampler' },
  { key: 'scheduler', label: 'Scheduler' },
];

type ModelSamplerHintsProps = {
  model: ComfyImageModel;
  preset: ModelSamplerPresetTier;
  onPresetChange: (preset: ModelSamplerPresetTier) => void;
  overrides?: ModelSamplerOverrideFields;
  onOverridesChange?: (overrides: ModelSamplerOverrideFields) => void;
};

export default function ModelSamplerHints({
  model,
  preset,
  onPresetChange,
  overrides = {},
  onOverridesChange,
}: ModelSamplerHintsProps) {
  const [overridesOpen, setOverridesOpen] = useState(() => hasModelSamplerOverrides(overrides));
  const defaults = getModelSamplerDefaults(model, preset);
  const activeOption =
    MODEL_SAMPLER_PRESET_OPTIONS.find(option => option.id === preset) ??
    MODEL_SAMPLER_PRESET_OPTIONS[0];
  const peopleHint =
    formatWanVideoSamplerHint(model, preset) ?? formatKleinSamplerPeopleHint(model, preset);
  const samplingHint = formatModelSamplingHint(model, preset);
  const overridesActive = hasModelSamplerOverrides(overrides);
  const distilledModel = model.includes('lightning') || /rapid-aio/i.test(model);

  const updateOverride = (key: OverrideFieldKey, value: string) => {
    onOverridesChange?.({ ...overrides, [key]: value });
  };

  const resetOverrides = () => {
    onOverridesChange?.({});
    setOverridesOpen(false);
  };

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
      <div className="space-y-3">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-sky-200/85">KSampler preset on queue</p>
          <p className="break-words text-xs text-zinc-300">
            {formatModelSamplerHint(model, preset)}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {MODEL_SAMPLER_PRESET_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={preset === option.id}
              onClick={() => onPresetChange(option.id)}
              className="w-full justify-center px-2"
            >
              {option.id === 'maxCompatible' ? 'Max compat.' : option.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {onOverridesChange ? (
        <div className="mt-3 border-t border-sky-500/15 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-1 py-1 text-left text-xs font-medium text-sky-100/90 transition hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
            aria-expanded={overridesOpen}
            onClick={() => setOverridesOpen(open => !open)}
          >
            <span>
              KSampler overrides
              {overridesActive ? (
                <span className="ml-1.5 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-normal text-sky-100/80">
                  active
                </span>
              ) : null}
            </span>
            <span className="text-sky-200/60" aria-hidden>
              {overridesOpen ? '−' : '+'}
            </span>
          </button>
          {overridesOpen ? (
            <div className="mt-2 space-y-2">
              <p className="type-caption text-zinc-500">
                Leave blank to use preset values. Overrides apply on queue and win over gallery
                sampler memory. Denoise blank uses tool defaults (1.0 txt2img, ~0.65 edit).
              </p>
              <div className="grid grid-cols-2 gap-2">
                {OVERRIDE_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key} className="min-w-0 space-y-1">
                    <FieldLabel>{label}</FieldLabel>
                    <input
                      value={overrides[key]?.toString() ?? ''}
                      placeholder={
                        placeholder ??
                        (key in defaults ? defaults[key as keyof typeof defaults]?.toString() : '') ??
                        ''
                      }
                      onChange={event => updateOverride(key, event.target.value)}
                      className="ui-input w-full px-2.5 py-1.5 text-sm transition focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    />
                  </div>
                ))}
              </div>
              {distilledModel ? (
                <p className="type-caption text-amber-200/75">
                  Lightning / Rapid models clamp steps and CFG on queue. Denoise override is
                  honored when set.
                </p>
              ) : null}
              {overridesActive ? (
                <button
                  type="button"
                  onClick={resetOverrides}
                  className="text-xs text-sky-200/80 transition hover:text-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Reset overrides
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 type-caption text-zinc-500">{activeOption.description}</p>
      {peopleHint ? <p className="mt-1.5 type-caption text-amber-200/80">{peopleHint}</p> : null}
      {samplingHint ? <p className="mt-1.5 type-caption text-zinc-500">{samplingHint}</p> : null}
      <details className="mt-2 group">
        <summary className="type-caption cursor-pointer list-none text-zinc-500 transition hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] [&::-webkit-details-marker]:hidden">
          <span className="underline decoration-zinc-600 underline-offset-2 group-open:decoration-zinc-500">
            How queue patching works
          </span>
        </summary>
        <p className="mt-1.5 type-caption text-zinc-500">
          Patches{' '}
          <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{SEED}}`}</code>,{' '}
          <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{STEPS}}`}</code>,{' '}
          <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{CFG}}`}</code>,{' '}
          <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{DENOISE}}`}</code>,{' '}
          <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{SAMPLER}}`}</code>,{' '}
          <code className="rounded bg-zinc-900/80 px-1 text-sky-200/90">{`{{SCHEDULER}}`}</code>
          , and Flux shift placeholders — or writes directly into sampler nodes.
          {defaults.fixedSeed == null
            ? ' Seed is randomized per job unless pinned in advanced queue params.'
            : null}
        </p>
      </details>
    </div>
  );
}
