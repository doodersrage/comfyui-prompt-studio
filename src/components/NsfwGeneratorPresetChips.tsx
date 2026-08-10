'use client';

import type { NsfwGeneratorPreset, NsfwPresetCategory } from '@/lib/nsfw-generator-presets';
import { NSFW_PRESET_CATEGORIES, nsfwPresetsForCategory } from '@/lib/nsfw-generator-presets';

type NsfwGeneratorPresetChipsProps = {
  selectedId?: string;
  category?: NsfwPresetCategory | 'all';
  onCategoryChange?: (category: NsfwPresetCategory | 'all') => void;
  onSelect: (preset: NsfwGeneratorPreset) => void;
};

export default function NsfwGeneratorPresetChips({
  selectedId,
  category = 'all',
  onCategoryChange,
  onSelect,
}: NsfwGeneratorPresetChipsProps) {
  const presets = nsfwPresetsForCategory(category);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">Scene presets</p>
        <p className="text-xs text-[var(--text-muted)]">{presets.length} starters</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {NSFW_PRESET_CATEGORIES.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => onCategoryChange?.(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-500 ${
              category === item.value
                ? 'border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-100'
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/40 hover:text-[var(--text-primary)]'
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
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-500 ${
                active
                  ? 'border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-100'
                  : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/40 hover:text-[var(--text-primary)]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
