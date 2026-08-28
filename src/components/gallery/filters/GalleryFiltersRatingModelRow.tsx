'use client';

import type { ComfyGalleryFilter } from '@/lib/comfyui-gallery';
import { FilterChip } from '@/components/gallery/GalleryFilterChip';

type Props = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  models: string[];
};

export function GalleryFiltersRatingModelRow({ filter, setFilter, models }: Props) {
  return (
    <div className="hidden flex-wrap items-center gap-2 md:flex">
      {(
        [
          { rating: undefined as 1 | 2 | 3 | 4 | 5 | undefined, label: 'Any ★' },
          { rating: 5 as const, label: '5★' },
          { rating: 4 as const, label: '≥4★' },
          { rating: 3 as const, label: '≥3★' },
          { rating: 1 as const, label: '≥1★' },
        ] as const
      ).map(option => (
        <FilterChip
          key={option.label}
          active={
            option.rating === undefined ? !filter.minRating : filter.minRating === option.rating
          }
          label={option.label}
          testId={
            option.rating === undefined
              ? 'gallery-filter-rating-any'
              : `gallery-filter-rating-${option.rating}`
          }
          onClick={() =>
            setFilter(previous => ({
              ...previous,
              minRating: option.rating,
            }))
          }
        />
      ))}
      {models.length > 0 ? (
        <label className="flex items-center gap-1.5 type-caption text-[var(--text-muted)]">
          Model
          <select
            value={filter.model ?? ''}
            onChange={event =>
              setFilter({
                ...filter,
                model: event.target.value || undefined,
              })
            }
            data-testid="gallery-filter-model"
            className="ui-input px-2 py-1 text-[11px]"
          >
            <option value="">All models</option>
            {models.map(model => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
