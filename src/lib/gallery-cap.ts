export type GalleryCapEntry = Pick<
  import('./comfyui-gallery-entry').ComfyGalleryEntry,
  'id' | 'favorite' | 'reviewRating' | 'queuedAt' | 'completedAt'
>;

/** Ratings at or above this are treated as keepers, same as favorite. */
export const GALLERY_CAP_KEEPER_MIN_RATING = 4;

function entryTimestamp(entry: GalleryCapEntry): number {
  return entry.completedAt ?? entry.queuedAt ?? 0;
}

function isGalleryCapKeeper(entry: GalleryCapEntry): boolean {
  return Boolean(entry.favorite) || (entry.reviewRating ?? 0) >= GALLERY_CAP_KEEPER_MIN_RATING;
}

export type GalleryCapResult<T extends GalleryCapEntry> = {
  kept: T[];
  evicted: T[];
};

export type GalleryCapWarningLevel = 'none' | 'notice' | 'urgent';

export function assessGalleryCapWarning(
  count: number,
  max: number
): { level: GalleryCapWarningLevel; message: string | null } {
  if (max <= 0 || count < max * 0.85) {
    return { level: 'none', message: null };
  }
  if (count >= max) {
    return {
      level: 'urgent',
      message: `Gallery at the ${max.toLocaleString()}-entry local cap. Unrated entries may be evicted on save — export or rate favorites to keep them.`,
    };
  }
  return {
    level: 'notice',
    message: `Gallery approaching the ${max.toLocaleString()}-entry local cap (${count.toLocaleString()} stored). Server sync keeps full history when PROMPT_DATA_DIR is enabled.`,
  };
}

/**
 * Trims `entries` down to `max` for local (browser) storage, preferring to
 * keep favorites / 4-5★ rated entries over plain unrated ones even when the
 * unrated ones are newer. Server storage should retain the full, untrimmed
 * list so `evicted` entries are never permanently lost — see
 * gallery-server-sync.ts.
 */
export function capGalleryEntriesForLocalStorage<T extends GalleryCapEntry>(
  entries: T[],
  max: number
): GalleryCapResult<T> {
  if (entries.length <= max || max < 0) {
    return { kept: entries, evicted: [] };
  }

  const keepers: T[] = [];
  const rest: T[] = [];
  for (const entry of entries) {
    if (isGalleryCapKeeper(entry)) {
      keepers.push(entry);
    } else {
      rest.push(entry);
    }
  }

  const byNewest = (a: T, b: T) => entryTimestamp(b) - entryTimestamp(a);
  keepers.sort(byNewest);
  rest.sort(byNewest);

  if (keepers.length >= max) {
    return {
      kept: keepers.slice(0, max),
      evicted: [...keepers.slice(max), ...rest],
    };
  }

  const restBudget = max - keepers.length;
  const keptRest = rest.slice(0, restBudget);
  const evictedRest = rest.slice(restBudget);

  const kept = [...keepers, ...keptRest].sort(byNewest);
  return { kept, evicted: evictedRest };
}
