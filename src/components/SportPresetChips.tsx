'use client';

import { sportPresetsForMode, type SportPreset } from '@/lib/sport-presets';

type SportPresetChipsProps = {
  selectedId?: string;
  onSelect: (preset: SportPreset) => void;
  category?: SportPreset['category'] | 'all';
  mode?: 'solo' | 'duo' | 'all';
};

export default function SportPresetChips({
  selectedId,
  onSelect,
  category = 'all',
  mode = 'all',
}: SportPresetChipsProps) {
  const presets =
    category === 'all'
      ? sportPresetsForMode(mode)
      : sportPresetsForMode(mode).filter(preset => preset.category === category);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-primary)]">Sport presets</p>
      <div className="flex flex-wrap gap-2">
        {presets.map(preset => {
          const active = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
                  : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {preset.label}
              {preset.duo ? ' · duo' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
