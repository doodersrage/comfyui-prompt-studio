import type { ComfyOutputImage, ComfyOutputMediaKind } from './comfyui-outputs';
import {
  buildComfyViewSrcSet,
  GALLERY_LIGHTBOX_WIDTH,
  GALLERY_LQIP_WIDTH,
  GALLERY_STRIP_THUMB_WIDTH,
  GALLERY_THUMB_SRCSET_WIDTHS,
  GALLERY_THUMB_WIDTH,
  resolveComfyOutputMediaKind,
  stripGalleryViewWidthParam,
} from './comfyui-outputs';
import { buildEngineViewPath } from './engine/view-paths';
import { filterBySemanticQuery } from './semantic-search';
import { orderGalleryBySimilarity } from './gallery-similarity';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { ComfyGalleryJobStatus } from './comfyui-gallery-types';
import {
  getGalleryCache,
  notifyGalleryUpdated,
  persistGalleryCache,
  setGalleryCache,
  clearGalleryDb,
} from './gallery-db-store';
import { COMFYUI_GALLERY_KEY, MAX_GALLERY_ENTRIES } from './comfyui-gallery-storage-meta';
import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { initGalleryStore } from './app-db-init';
import { getActiveUserId } from './user-scope';
import { scheduleUserAnalyticsSync } from './user-analytics-sync';
import { capGalleryEntriesForLocalStorage } from './gallery-cap';
import { rememberGalleryDeletedIds } from './gallery-deleted-ids';
import { galleryEntryCorpus } from './embedding-rank';

export type { ComfyGalleryEntry } from './comfyui-gallery-entry';
export type { ComfyGalleryJobStatus } from './comfyui-gallery-types';
export {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from './comfyui-gallery-storage-meta';
export { initAppDb, initGalleryStore, isAppDbReady, isGalleryStoreReady } from './app-db-init';

export type ComfyGalleryFilter = {
  status?: ComfyGalleryJobStatus | 'all';
  favoritesOnly?: boolean;
  tool?: string;
  query?: string;
  semanticSearch?: boolean;
  similarToEntryId?: string;
  /** Show only outputs derived from this gallery entry. */
  derivativeOfEntryId?: string;
  /** Show only this gallery entry (lineage jump). */
  focusEntryId?: string;
  /** Filter by derivative kind (upscale, refine, variation). */
  derivedKind?: ComfyGalleryEntry['derivedKind'];
  /** Filter by primary media kind (image stills vs video). */
  mediaKind?: 'image' | 'video' | 'all';
  projectId?: string;
  reviewMode?: boolean;
  unreviewedOnly?: boolean;
  reviewAutoAdvance?: boolean;
  /** Only entries with vision LLM tags. */
  visionTagsOnly?: boolean;
};

export type ComfyGallerySort =
  'queued-desc' | 'queued-asc' | 'completed-desc' | 'tool-asc' | 'favorites-first';

export const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
export const GALLERY_PAGE_SIZE_ALL = 'all' as const;
/** Initial render cap when page size is "All" — use Load more for the rest. */
export const GALLERY_ALL_RENDER_CHUNK = 48;

export function galleryEntryRenderKey(entry: ComfyGalleryEntry): string {
  // Use a more efficient key generation approach
  // Only include fields that actually affect rendering and don't change frequently
  const parts = [
    entry.id,
    entry.status,
    entry.favorite ? 1 : 0,
    entry.reviewRating ?? 0,
    entry.derivedKind ?? '',
    entry.parentGalleryEntryId ?? '',
    entry.statusMessage ?? '',
    entry.promptId ?? '',
    entry.visionTags?.join(',') ?? '',
    entry.projectId ?? '',
  ];

  // For in-flight entries, include progress info to prevent unnecessary re-renders
  if ((entry.status as string) === 'queued' || entry.status === 'running') {
    parts.push(
      entry.queuePosition ?? '',
      entry.progressValue ?? '',
      entry.progressMax ?? '',
      entry.progressNode ?? ''
    );
  }

  return parts.join('|');
}
export type GalleryPageSize =
  (typeof GALLERY_PAGE_SIZE_OPTIONS)[number] | typeof GALLERY_PAGE_SIZE_ALL;

export const GALLERY_SLIDESHOW_INTERVAL_OPTIONS = [
  2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 45000, 60000, 90000, 120000,
] as const;
export type GallerySlideshowIntervalMs = (typeof GALLERY_SLIDESHOW_INTERVAL_OPTIONS)[number];

export function formatGallerySlideshowInterval(ms: number): string {
  if (ms < 60_000) {
    return `${ms / 1000}s`;
  }

  const minutes = Math.floor(ms / 60_000);
  const seconds = (ms % 60_000) / 1000;
  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

export function normalizeGallerySlideshowIntervalMs(value: unknown): GallerySlideshowIntervalMs {
  if (isGallerySlideshowIntervalMs(value)) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return GALLERY_SLIDESHOW_INTERVAL_OPTIONS.reduce((best, option) =>
      Math.abs(option - value) < Math.abs(best - value) ? option : best
    );
  }

  return DEFAULT_GALLERY_VIEW.slideshowIntervalMs;
}

export const GALLERY_SLIDESHOW_TRANSITION_OPTIONS = ['slide', 'fade', 'zoom', 'none'] as const;
export type GallerySlideshowTransition = (typeof GALLERY_SLIDESHOW_TRANSITION_OPTIONS)[number];

export const GALLERY_SLIDESHOW_TRANSITION_LABELS: Record<GallerySlideshowTransition, string> = {
  slide: 'Slide',
  fade: 'Fade',
  zoom: 'Zoom',
  none: 'Instant',
};

export function isGallerySlideshowTransition(value: unknown): value is GallerySlideshowTransition {
  return (
    typeof value === 'string' &&
    GALLERY_SLIDESHOW_TRANSITION_OPTIONS.includes(value as GallerySlideshowTransition)
  );
}

export function resolveGallerySlideshowTransition(value: unknown): GallerySlideshowTransition {
  return isGallerySlideshowTransition(value) ? value : DEFAULT_GALLERY_VIEW.slideshowTransition;
}

export const GALLERY_SLIDESHOW_TRANSITION_MS = 520;

export function resolveGallerySlideshowTransitionMs(
  transition: GallerySlideshowTransition
): number {
  return transition === 'none' ? 0 : GALLERY_SLIDESHOW_TRANSITION_MS;
}

export type GalleryLayoutMode = 'grid' | 'dense' | 'list';

export type ComfyGalleryViewPreferences = {
  sort: ComfyGallerySort;
  pageSize: GalleryPageSize;
  slideshowIntervalMs: GallerySlideshowIntervalMs;
  slideshowTransition: GallerySlideshowTransition;
  layout: GalleryLayoutMode;
};

export const DEFAULT_GALLERY_VIEW: ComfyGalleryViewPreferences = {
  sort: 'queued-desc',
  pageSize: 12,
  slideshowIntervalMs: 5000,
  slideshowTransition: 'slide',
  layout: 'grid',
};

export function isGallerySlideshowIntervalMs(value: unknown): value is GallerySlideshowIntervalMs {
  return (
    typeof value === 'number' &&
    GALLERY_SLIDESHOW_INTERVAL_OPTIONS.includes(value as GallerySlideshowIntervalMs)
  );
}

export function isGalleryPageSize(value: unknown): value is GalleryPageSize {
  return (
    value === GALLERY_PAGE_SIZE_ALL ||
    (typeof value === 'number' &&
      GALLERY_PAGE_SIZE_OPTIONS.includes(value as (typeof GALLERY_PAGE_SIZE_OPTIONS)[number]))
  );
}

export function resolveGalleryPageSize(pageSize: GalleryPageSize, totalItems: number): number {
  if (pageSize === GALLERY_PAGE_SIZE_ALL) {
    return Math.max(totalItems, 1);
  }

  return pageSize;
}

export const COMFYUI_GALLERY_VIEW_KEY = 'comfyui-gallery-view-v1';

function readLegacyLocalStorageGallery(): ComfyGalleryEntry[] {
  const parsed = readBrowserValue<unknown>(COMFYUI_GALLERY_KEY);
  return Array.isArray(parsed) ? (parsed as ComfyGalleryEntry[]) : [];
}

export function loadComfyGallery(): ComfyGalleryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const cached = getGalleryCache();
  if (cached.length > 0) {
    return cached;
  }

  return readLegacyLocalStorageGallery();
}

export async function loadComfyGalleryAsync(): Promise<ComfyGalleryEntry[]> {
  await initGalleryStore();
  return loadComfyGallery();
}

export function saveComfyGallery(
  entries: ComfyGalleryEntry[],
  options?: { syncRemote?: boolean }
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const { kept, evicted } = capGalleryEntriesForLocalStorage(entries, MAX_GALLERY_ENTRIES);
  setGalleryCache(kept);
  notifyGalleryUpdated();
  scheduleUserAnalyticsSync();
  if (options?.syncRemote !== false) {
    if (evicted.length > 0) {
      // The local cap prefers keeping favorites/high ratings — push the full,
      // untrimmed list so server storage still has the complete history.
      void import('./storage-sync').then(({ syncNamespaceToServer }) =>
        syncNamespaceToServer('comfy-gallery', entries)
      );
      // Also download a local archive of evicted entries so nothing is only on the server.
      void import('./gallery-zip-export').then(({ downloadGalleryZipBundle }) =>
        downloadGalleryZipBundle(evicted, {
          filename: `gallery-archive-evicted-${Date.now()}.zip`,
        })
      );
    }
    void import('./auto-storage-sync').then(({ scheduleAutoPushStorage }) =>
      scheduleAutoPushStorage()
    );
  }
  void initGalleryStore()
    .then(() => persistGalleryCache())
    .then(() =>
      import('./tab-sync').then(({ broadcastTabSync }) =>
        broadcastTabSync({ type: 'gallery-updated' })
      )
    );
}

export async function saveComfyGalleryAsync(entries: ComfyGalleryEntry[]): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const { kept } = capGalleryEntriesForLocalStorage(entries, MAX_GALLERY_ENTRIES);
  setGalleryCache(kept);
  await initGalleryStore();
  await persistGalleryCache();
  notifyGalleryUpdated();
  scheduleUserAnalyticsSync();
}

export function clearComfyGallery(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const previous = loadComfyGallery();
  const deletedIds = rememberGalleryDeletedIds(previous.map(entry => entry.id));
  saveComfyGallery([], { syncRemote: false });
  void clearGalleryDb();
  void import('./gallery-server-sync').then(({ pushGalleryDeletionsToServer }) =>
    pushGalleryDeletionsToServer([], deletedIds)
  );
}

export function filterComfyGalleryEntries(
  entries: ComfyGalleryEntry[],
  filter: ComfyGalleryFilter
): ComfyGalleryEntry[] {
  const query = filter.query?.trim();

  // Cache corpus strings once to avoid repeated join/filter during filtering.
  const haystacks = entries.map(
    entry =>
      [
        entry.prompt,
        entry.negativePrompt,
        entry.tool,
        entry.model,
        entry.promptId,
        entry.statusMessage,
        entry.visionTags?.join(' '),
      ]
        .filter(Boolean)
        .join(' ') // keep original case — we'll lowercase only when needed
  );

  let filtered: ComfyGalleryEntry[] = [];
  let idx = 0;
  for (const entry of entries) {
    const haystack = haystacks[idx];
    const needleLower = query ? query.toLowerCase() : '';
    // Early-exit on string match before doing any other checks when non-semantic search.
    if (query && !filter.semanticSearch && haystack.toLowerCase().indexOf(needleLower) === -1) {
      idx += 1;
      continue;
    }

    if (filter.favoritesOnly && !(entry.favorite ?? false)) {
      idx += 1;
      continue;
    }
    if (filter.status && filter.status !== 'all' && entry.status !== filter.status) {
      idx += 1;
      continue;
    }
    if (filter.tool?.trim() && entry.tool !== filter.tool.trim()) {
      idx += 1;
      continue;
    }
    if (filter.unreviewedOnly && entry.reviewRating) {
      idx += 1;
      continue;
    }
    if (filter.projectId?.trim() && entry.projectId !== filter.projectId.trim()) {
      idx += 1;
      continue;
    }
    if (filter.visionTagsOnly && !(entry.visionTags?.length ?? 0)) {
      idx += 1;
      continue;
    }
    if (filter.focusEntryId?.trim() && entry.id !== filter.focusEntryId.trim()) {
      idx += 1;
      continue;
    }
    if (
      filter.derivativeOfEntryId?.trim() &&
      entry.parentGalleryEntryId !== filter.derivativeOfEntryId.trim()
    ) {
      idx += 1;
      continue;
    }
    if (filter.derivedKind && entry.derivedKind !== filter.derivedKind) {
      idx += 1;
      continue;
    }
    if (filter.mediaKind && filter.mediaKind !== 'all') {
      // Reuse the URL cache so we don't double-build images.
      const mediaCache = galleryEntryThumbUrls(entry);
      const kind = mediaCache.length > 0 ? resolveComfyOutputMediaKind(entry.images[0]) : 'image';
      if (kind !== filter.mediaKind) {
        idx += 1;
        continue;
      }
    }

    filtered.push(entry);
    idx += 1;
  }

  if (query && filter.semanticSearch) {
    // Pre-compute corpus strings to avoid repeated join/filter allocations during ranking.
    const corpora = new Map(filtered.map(entry => [entry.id, galleryEntryCorpus(entry)]));
    filtered = filterBySemanticQuery(filtered, query, entry => corpora.get(entry.id)!);
  }

  if (filter.similarToEntryId) {
    const reference = entries.find(entry => entry.id === filter.similarToEntryId);
    if (reference) {
      filtered = orderGalleryBySimilarity(filtered, reference);
    }
  }

  return filtered;
}

export function paginateGalleryEntries<T>(
  entries: T[],
  page: number,
  pageSize: number
): { items: T[]; page: number; totalPages: number; totalItems: number } {
  const totalItems = entries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: entries.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalItems,
  };
}

export function sortGalleryEntries(
  entries: ComfyGalleryEntry[],
  sort: ComfyGallerySort = DEFAULT_GALLERY_VIEW.sort
): ComfyGalleryEntry[] {
  // Skip the copy when no sorting is needed — default (queued-desc) is typically already correct.
  if (sort === 'queued-desc' && entries.length <= 1) return entries;
  const sorted = [...entries];

  switch (sort) {
    case 'queued-asc':
      return sorted.sort((a, b) => a.queuedAt - b.queuedAt);
    case 'completed-desc':
      return sorted.sort((a, b) => (b.completedAt ?? b.queuedAt) - (a.completedAt ?? a.queuedAt));
    case 'tool-asc':
      return sorted.sort((a, b) => {
        const ta = a.tool ?? '';
        const tb = b.tool ?? '';
        if (ta === '') return 1; // empty sorts last
        if (tb === '') return -1;
        return ta.localeCompare(tb) || b.queuedAt - a.queuedAt;
      });
    case 'favorites-first':
      return sorted.sort(
        (a, b) =>
          Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.queuedAt - a.queuedAt
      );
    case 'queued-desc':
    default:
      return sorted.sort((a, b) => b.queuedAt - a.queuedAt);
  }
}

export function loadGalleryViewPreferences(): ComfyGalleryViewPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_GALLERY_VIEW;
  }

  try {
    const parsed = readBrowserValue<Partial<ComfyGalleryViewPreferences>>(COMFYUI_GALLERY_VIEW_KEY);
    if (!parsed) {
      return DEFAULT_GALLERY_VIEW;
    }
    const pageSize = isGalleryPageSize(parsed.pageSize)
      ? parsed.pageSize
      : DEFAULT_GALLERY_VIEW.pageSize;

    const sortValues: ComfyGallerySort[] = [
      'queued-desc',
      'queued-asc',
      'completed-desc',
      'tool-asc',
      'favorites-first',
    ];
    const sort = sortValues.includes(parsed.sort as ComfyGallerySort)
      ? (parsed.sort as ComfyGallerySort)
      : DEFAULT_GALLERY_VIEW.sort;
    const slideshowIntervalMs = normalizeGallerySlideshowIntervalMs(parsed.slideshowIntervalMs);
    const slideshowTransition = resolveGallerySlideshowTransition(parsed.slideshowTransition);
    const layoutValues: GalleryLayoutMode[] = ['grid', 'dense', 'list'];
    const layout = layoutValues.includes(parsed.layout as GalleryLayoutMode)
      ? (parsed.layout as GalleryLayoutMode)
      : DEFAULT_GALLERY_VIEW.layout;

    return { sort, pageSize, slideshowIntervalMs, slideshowTransition, layout };
  } catch {
    return DEFAULT_GALLERY_VIEW;
  }
}

export function saveGalleryViewPreferences(preferences: ComfyGalleryViewPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  writeBrowserValue(COMFYUI_GALLERY_VIEW_KEY, preferences);
}

export function uniqueGalleryTools(entries: ComfyGalleryEntry[]): string[] {
  return [...new Set(entries.map(entry => entry.tool).filter(Boolean) as string[])].sort();
}

export function addComfyGalleryEntry(
  input: Omit<ComfyGalleryEntry, 'id' | 'queuedAt' | 'images' | 'status'> & {
    status?: ComfyGalleryJobStatus;
    images?: ComfyOutputImage[];
  }
): ComfyGalleryEntry {
  const userId = getActiveUserId();
  const entry: ComfyGalleryEntry = {
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
    status: input.status ?? 'pending',
    images: input.images ?? [],
    ...input,
    userId: input.userId ?? userId ?? undefined,
  };

  (entry as { _corpus?: string })._corpus = galleryEntryCorpus(entry);
  saveComfyGallery([entry, ...loadComfyGallery()]);
  return entry;
}

export function updateComfyGalleryEntryById(
  id: string,
  patch: Partial<
    Pick<
      ComfyGalleryEntry,
      | 'status'
      | 'statusMessage'
      | 'queuePosition'
      | 'progressValue'
      | 'progressMax'
      | 'progressNode'
      | 'completedAt'
      | 'renderDurationMs'
      | 'executionStartedAt'
      | 'images'
      | 'comfyUrl'
      | 'favorite'
      | 'historyId'
      | 'negativePrompt'
      | 'queueParams'
      | 'reviewRating'
      | 'projectId'
      | 'visionTags'
      | 'aestheticScore'
      | 'aestheticScoreMethod'
    >
  >
): ComfyGalleryEntry | null {
  const entries = loadComfyGallery();
  let updated: ComfyGalleryEntry | null = null;
  const next = entries.map(entry => {
    if (entry.id !== id) {
      return entry;
    }
    updated = { ...entry, ...patch };
    return updated;
  });
  if (!updated) {
    return null;
  }
  if (patch.status === 'completed') {
    const prior = entries.find(entry => entry.id === id);
    if (prior && prior.status !== 'completed') {
      void import('./notification-center').then(({ pushNotification }) =>
        pushNotification({
          title: 'ComfyUI job completed',
          body: updated!.prompt.slice(0, 80),
          href: '/gallery',
          kind: 'job',
        })
      );
    }
  }
  saveComfyGallery(next);
  return updated;
}

function galleryPatchIsEphemeralProgress(patch: Partial<ComfyGalleryEntry>): boolean {
  if (patch.status === 'completed' || patch.status === 'error') {
    return false;
  }
  if (patch.images || patch.completedAt != null || patch.favorite != null) {
    return false;
  }
  if (patch.historyId || patch.queueParams || patch.reviewRating != null || patch.projectId) {
    return false;
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return false;
  }
  return keys.every(key =>
    [
      'status',
      'statusMessage',
      'queuePosition',
      'progressValue',
      'progressMax',
      'progressNode',
      'comfyUrl',
    ].includes(key)
  );
}

export function updateComfyGalleryByPromptId(
  promptId: string,
  patch: Partial<
    Pick<
      ComfyGalleryEntry,
      | 'status'
      | 'statusMessage'
      | 'queuePosition'
      | 'progressValue'
      | 'progressMax'
      | 'progressNode'
      | 'completedAt'
      | 'renderDurationMs'
      | 'executionStartedAt'
      | 'images'
      | 'comfyUrl'
      | 'clientId'
      | 'favorite'
      | 'historyId'
      | 'queueParams'
      | 'reviewRating'
      | 'projectId'
      | 'oomRetryAttempted'
    >
  >
): ComfyGalleryEntry | null {
  let updated: ComfyGalleryEntry | null = null;
  const next = loadComfyGallery().map(entry => {
    if (entry.promptId !== promptId) {
      return entry;
    }
    updated = { ...entry, ...patch };
    return updated;
  });

  if (!updated) {
    return null;
  }

  saveComfyGallery(next, {
    syncRemote: !galleryPatchIsEphemeralProgress(patch),
  });
  return updated;
}

export function toggleComfyGalleryFavorite(id: string): void {
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
    )
  );
}

export function setGalleryReviewRating(
  id: string,
  reviewRating: ComfyGalleryEntry['reviewRating']
): void {
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      entry.id === id
        ? { ...entry, reviewRating, favorite: reviewRating === 5 ? true : entry.favorite }
        : entry
    )
  );
}

export function removeComfyGalleryEntry(id: string): void {
  const deletedIds = rememberGalleryDeletedIds([id]);
  const next = loadComfyGallery().filter(entry => entry.id !== id);
  saveComfyGallery(next, { syncRemote: false });
  void import('./gallery-server-sync').then(({ pushGalleryDeletionsToServer }) =>
    pushGalleryDeletionsToServer(next, deletedIds)
  );
}

export function removeComfyGalleryEntries(ids: string[]): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  const deletedIds = rememberGalleryDeletedIds(ids);
  const next = loadComfyGallery().filter(entry => !idSet.has(entry.id));
  saveComfyGallery(next, { syncRemote: false });
  void import('./gallery-server-sync').then(({ pushGalleryDeletionsToServer }) =>
    pushGalleryDeletionsToServer(next, deletedIds)
  );
}

export function setComfyGalleryProjectIds(ids: string[], projectId: string | undefined): void {
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry =>
      idSet.has(entry.id) ? { ...entry, projectId: projectId || undefined } : entry
    )
  );
}

export function setComfyGalleryFavorites(ids: string[], favorite: boolean): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map(entry => (idSet.has(entry.id) ? { ...entry, favorite } : entry))
  );
}

function galleryEntryBuildViewPath(
  entry: ComfyGalleryEntry,
  image: ComfyGalleryEntry['images'][number],
  options?: { width?: number }
): string {
  return buildEngineViewPath(entry.engineId, entry.comfyUrl, image, options);
}

/** Bounded per-entry URL cache to avoid re-allocating URLSearchParams on every render pass. */
const _entryUrlCacheMaxSize = 4096;
const _entryUrlCache = new Map<
  string,
  {
    thumb: string[] | null;
    stripThumb: string[] | null;
    lightbox: string[] | null;
    view: string[] | null;
    primaryView: string | null;
    primaryThumb: string | null;
    primaryMediaKind: ComfyOutputMediaKind;
    lqip: string | null;
    download: { url: string[]; filename: string[] } | null;
  }
>();

function _setOrEvictUrlCache(
  key: string,
  value:
    | { thumb: string[] }
    | { stripThumb: string[] }
    | { lightbox: string[] }
    | { view: string[] }
    | { primaryView: string | null }
    | { primaryThumb: string | null }
    | { primaryMediaKind: ComfyOutputMediaKind }
    | { lqip: string | null }
    | { download: { url: string[]; filename: string[] } }
) {
  if (_entryUrlCache.size >= _entryUrlCacheMaxSize) {
    const half = Math.floor(_entryUrlCacheMaxSize / 2);
    let evicted = 0;
    for (const k of _entryUrlCache.keys()) {
      if (evicted >= half) break;
      _entryUrlCache.delete(k);
      evicted += 1;
    }
  }
  if ('download' in value && value.download) {
    _setOrEvictUrlCache(key, { download: value.download });
  } else if ('thumb' in value && value.thumb) {
    _setOrEvictUrlCache(key, { thumb: value.thumb });
  } else if ('stripThumb' in value && value.stripThumb) {
    _setOrEvictUrlCache(key, { stripThumb: value.stripThumb });
  } else if ('lightbox' in value && value.lightbox) {
    _setOrEvictUrlCache(key, { lightbox: value.lightbox });
  } else if ('view' in value && value.view) {
    _setOrEvictUrlCache(key, { view: value.view });
  } else if ('primaryView' in value) {
    _setOrEvictUrlCache(key, value);
  } else if ('primaryThumb' in value) {
    _setOrEvictUrlCache(key, value);
  } else if ('primaryMediaKind' in value) {
    _setOrEvictUrlCache(key, value);
  } else {
    _setOrEvictUrlCache(key, value);
  }
}

function _updateUrlCache(
  key: string,
  partial:
    | { thumb?: string[] | null }
    | { stripThumb?: string[] | null }
    | { lightbox?: string[] | null }
    | { view?: string[] | null }
    | { primaryView?: string | null }
    | { primaryThumb?: string | null }
    | { primaryMediaKind?: ComfyOutputMediaKind }
    | { lqip?: string | null }
    | { download?: { url: string[]; filename: string[] } | null }
) {
  let entry = _entryUrlCache.get(key);
  if (!entry) {
    entry = {
      thumb: null,
      stripThumb: null,
      lightbox: null,
      view: null,
      primaryView: null,
      primaryThumb: null,
      primaryMediaKind: 'image',
      lqip: null,
      download: null,
    };
  }
  Object.assign(entry, partial);
  _entryUrlCache.set(key, entry);
}

export function galleryEntryViewUrls(entry: ComfyGalleryEntry): string[] {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.view) return entryCache.view;

  const urls = entry.images.map(image => galleryEntryBuildViewPath(entry, image));
  _updateUrlCache(key, { view: urls });
  return urls;
}

export function galleryEntryThumbUrls(entry: ComfyGalleryEntry): string[] {
  const key = `${entry.id}|${entry.images.length}`;
  let cached = _entryUrlCache.get(key)?.thumb;
  if (cached) return cached;

  cached = entry.images.map(image =>
    galleryEntryBuildViewPath(entry, image, { width: GALLERY_THUMB_WIDTH })
  );

  const mediaKind = cached.length > 0 ? resolveComfyOutputMediaKind(entry.images[0]) : 'image';

  _updateUrlCache(key, {
    thumb: cached,
    primaryThumb: cached[0] ?? null,
    primaryMediaKind: mediaKind,
  });

  return cached;
}

export function galleryEntryStripThumbUrls(entry: ComfyGalleryEntry): string[] {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.stripThumb) return entryCache.stripThumb;

  const urls = entry.images.map(image =>
    galleryEntryBuildViewPath(entry, image, {
      width: GALLERY_STRIP_THUMB_WIDTH,
    })
  );

  _updateUrlCache(key, { stripThumb: urls });
  return urls;
}

export function galleryEntryLightboxUrls(entry: ComfyGalleryEntry): string[] {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.lightbox) return entryCache.lightbox;

  const urls = entry.images.map(image =>
    galleryEntryBuildViewPath(entry, image, { width: GALLERY_LIGHTBOX_WIDTH })
  );

  _updateUrlCache(key, { lightbox: urls });
  return urls;
}

export function galleryEntryPrimaryViewUrl(entry: ComfyGalleryEntry): string | null {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.primaryView) return entryCache.primaryView;

  const urls = galleryEntryViewUrls(entry);
  const primary = urls[0] ?? null;
  _updateUrlCache(key, { primaryView: primary });
  return primary;
}

export function galleryEntryPrimaryThumbUrl(entry: ComfyGalleryEntry): string | null {
  // Reuse the thumb cache so we don't double-build.
  const all = galleryEntryThumbUrls(entry);
  return all[0] ?? null;
}

export function galleryEntryPrimaryThumbSrcSet(entry: ComfyGalleryEntry): string | null {
  const image = entry.images[0];
  if (!image) {
    return null;
  }
  if (entry.engineId === 'diffusers') {
    return GALLERY_THUMB_SRCSET_WIDTHS.map(
      width => `${galleryEntryBuildViewPath(entry, image, { width })} ${width}w`
    ).join(', ');
  }
  return buildComfyViewSrcSet(entry.comfyUrl, image);
}

/** Per-image media kind (image vs. video/animated) for gallery rendering. */
export function galleryEntryMediaKinds(entry: ComfyGalleryEntry): ComfyOutputMediaKind[] {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.primaryMediaKind) {
    // Reuse the cached media kind when we have one; fall back to computing.
    const kinds = entry.images.map(image => resolveComfyOutputMediaKind(image));
    return kinds;
  }

  const kinds = entry.images.map(image => resolveComfyOutputMediaKind(image));
  _updateUrlCache(key, { primaryMediaKind: kinds[0] ?? 'image' });
  return kinds;
}

/** Media kind of the entry's primary (first) output. */
export function galleryEntryPrimaryMediaKind(entry: ComfyGalleryEntry): ComfyOutputMediaKind {
  const image = entry.images[0];
  return image ? resolveComfyOutputMediaKind(image) : 'image';
}

export function galleryEntryPrimaryLqipUrl(entry: ComfyGalleryEntry): string | null {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.lqip) return entryCache.lqip;

  const image = entry.images[0];
  if (!image) {
    _updateUrlCache(key, { lqip: null });
    return null;
  }

  const url = galleryEntryBuildViewPath(entry, image, { width: GALLERY_LQIP_WIDTH });
  _updateUrlCache(key, { lqip: url });
  return url;
}

export function galleryEntryDownloadUrls(entry: ComfyGalleryEntry): {
  url: string[];
  filename: string[];
} {
  const key = `${entry.id}|${entry.images.length}`;
  const entryCache = _entryUrlCache.get(key);
  if (entryCache?.download) return entryCache.download;

  const urls = entry.images.map(image => galleryEntryBuildViewPath(entry, image));
  const filenames = entry.images.map(image => image.filename ?? '');
  _updateUrlCache(key, { download: { url: urls, filename: filenames } });
  return { url: urls, filename: filenames };
}

export type GalleryLightboxPlaylist = {
  /** Mid-res proxy URLs for in-lightbox display. */
  images: string[];
  /** Grid-thumb proxy URLs (usually already cached) for blur-up placeholders. */
  thumbImages: string[];
  /** Full-res view URLs (no width resize) for "Open original". */
  originalImages: string[];
  /** Download-ready Comfy view URLs (with width param) parallel to `images`. */
  downloadUrls: string[];
  /** Per-slide filenames for naming the downloaded file. */
  downloadFilenames: string[];
  titles: string[];
  /** Per-slide media kind, parallel to `images`/`originalImages`. */
  mediaKinds: ComfyOutputMediaKind[];
};

export function buildGalleryLightboxPlaylist(
  entries: readonly ComfyGalleryEntry[],
  titleLength = 120
): GalleryLightboxPlaylist {
  const images: string[] = [];
  const thumbImages: string[] = [];
  const originalImages: string[] = [];
  const downloadUrls: string[] = [];
  const downloadFilenames: string[] = [];
  const titles: string[] = [];
  const mediaKinds: ComfyOutputMediaKind[] = [];

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    const thumbs = galleryEntryThumbUrls(entry);
    const originals = galleryEntryViewUrls(entry);
    const downloadMeta = galleryEntryDownloadUrls(entry);
    const kinds = galleryEntryMediaKinds(entry);
    if (urls.length === 0) {
      continue;
    }

    const title = entry.prompt.slice(0, titleLength);
    for (let i = 0; i < urls.length; i += 1) {
      images.push(urls[i]!);
      thumbImages.push(thumbs[i] ?? urls[i]!);
      originalImages.push(stripGalleryViewWidthParam(originals[i] ?? urls[i]!));
      downloadUrls.push(downloadMeta.url[i] ?? originals[i] ?? urls[i]!);
      downloadFilenames.push(downloadMeta.filename[i] ?? '');
      titles.push(title);
      mediaKinds.push(kinds[i] ?? 'image');
    }
  }

  return {
    images,
    thumbImages,
    originalImages,
    downloadUrls,
    downloadFilenames,
    titles,
    mediaKinds,
  };
}

export function resolveGalleryLightboxOpenIndex(
  entries: readonly ComfyGalleryEntry[],
  entryId: string,
  imageIndex = 0
): number {
  let flatIndex = 0;

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      continue;
    }

    if (entry.id === entryId) {
      return flatIndex + Math.min(Math.max(imageIndex, 0), urls.length - 1);
    }

    flatIndex += urls.length;
  }

  return 0;
}

export function resolveGalleryLightboxEntry(
  entries: readonly ComfyGalleryEntry[],
  flatIndex: number
): { entry: ComfyGalleryEntry; imageIndex: number } | null {
  let cumulative = 0;

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      continue;
    }

    if (flatIndex >= cumulative && flatIndex < cumulative + urls.length) {
      return { entry, imageIndex: flatIndex - cumulative };
    }

    cumulative += urls.length;
  }

  return null;
}
