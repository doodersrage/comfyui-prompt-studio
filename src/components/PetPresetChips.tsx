'use client';

import { useMemo, useState } from 'react';
import {
  PET_PRESET_CATEGORIES,
  petPresetsForCategory,
  type PetPreset,
  type PetPresetCategory,
} from '@/lib/pet-presets';

type PetPresetChipsProps = {
  selectedId?: string;
  onSelect: (preset: PetPreset) => void;
  category?: PetPresetCategory | 'all';
  onCategoryChange?: (category: PetPresetCategory | 'all') => void;
};

export default function PetPresetChips({
  selectedId,
  onSelect,
  category = 'all',
  onCategoryChange,
}: PetPresetChipsProps) {
  const [localCategory, setLocalCategory] = useState<PetPresetCategory | 'all'>(category);
  const activeCategory = onCategoryChange ? category : localCategory;
  const presets = useMemo(() => petPresetsForCategory(activeCategory), [activeCategory]);

  const setCategory = (next: PetPresetCategory | 'all') => {
    if (onCategoryChange) {
      onCategoryChange(next);
      return;
    }
    setLocalCategory(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">Pet presets</p>
        <p className="text-xs text-zinc-500">{presets.length} scenes</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PET_PRESET_CATEGORIES.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => setCategory(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activeCategory === item.value
                ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

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
                  ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {preset.label}
              {preset.pair ? ' · pair' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
