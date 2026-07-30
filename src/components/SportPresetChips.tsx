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
      <p className="text-sm font-medium text-zinc-200">Sport presets</p>
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
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
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
