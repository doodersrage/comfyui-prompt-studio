import type { ComfyOutputImage } from "./comfyui-outputs";
import {
  buildComfyViewPath,
  buildComfyViewSrcSet,
  GALLERY_LIGHTBOX_WIDTH,
  GALLERY_LQIP_WIDTH,
  GALLERY_STRIP_THUMB_WIDTH,
  GALLERY_THUMB_WIDTH,
} from "./comfyui-outputs";
import { filterBySemanticQuery } from "./semantic-search";
import { orderGalleryBySimilarity } from "./gallery-similarity";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import type { ComfyGalleryJobStatus } from "./comfyui-gallery-types";
import {
  getGalleryCache,
  notifyGalleryUpdated,
  persistGalleryCache,
  setGalleryCache,
  clearGalleryDb,
} from "./gallery-db-store";
import { COMFYUI_GALLERY_KEY } from "./comfyui-gallery-storage-meta";
import {
  readBrowserValue,
  writeBrowserValue,
} from "./browser-storage";
import { initGalleryStore } from "./app-db-init";
import { getActiveUserId } from "./user-scope";
import { scheduleUserAnalyticsSync } from "./user-analytics-sync";

export type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
export type { ComfyGalleryJobStatus } from "./comfyui-gallery-types";
export {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from "./comfyui-gallery-storage-meta";
export { initAppDb, initGalleryStore, isAppDbReady, isGalleryStoreReady } from "./app-db-init";

export type ComfyGalleryFilter = {
  status?: ComfyGalleryJobStatus | "all";
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
  derivedKind?: ComfyGalleryEntry["derivedKind"];
  projectId?: string;
  reviewMode?: boolean;
  unreviewedOnly?: boolean;
  reviewAutoAdvance?: boolean;
  /** Only entries with vision LLM tags. */
  visionTagsOnly?: boolean;
};

export type ComfyGallerySort =
  | "queued-desc"
  | "queued-asc"
  | "completed-desc"
  | "tool-asc"
  | "favorites-first";

export const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
export const GALLERY_PAGE_SIZE_ALL = "all" as const;
/** Initial render cap when page size is "All" — use Load more for the rest. */
export const GALLERY_ALL_RENDER_CHUNK = 48;

export function galleryEntryRenderKey(entry: ComfyGalleryEntry): string {
  return [
    entry.id,
    entry.status,
    entry.favorite ? 1 : 0,
    entry.reviewRating ?? 0,
    entry.derivedKind ?? "",
    entry.parentGalleryEntryId ?? "",
    entry.statusMessage ?? "",
    entry.promptId ?? "",
    entry.visionTags?.join(",") ?? "",
    entry.projectId ?? "",
  ].join("|");
}
export type GalleryPageSize =
  | (typeof GALLERY_PAGE_SIZE_OPTIONS)[number]
  | typeof GALLERY_PAGE_SIZE_ALL;

export const GALLERY_SLIDESHOW_INTERVAL_OPTIONS = [
  2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 45000, 60000, 90000,
  120000,
] as const;
export type GallerySlideshowIntervalMs =
  (typeof GALLERY_SLIDESHOW_INTERVAL_OPTIONS)[number];

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

export function normalizeGallerySlideshowIntervalMs(
  value: unknown,
): GallerySlideshowIntervalMs {
  if (isGallerySlideshowIntervalMs(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return GALLERY_SLIDESHOW_INTERVAL_OPTIONS.reduce((best, option) =>
      Math.abs(option - value) < Math.abs(best - value) ? option : best,
    );
  }

  return DEFAULT_GALLERY_VIEW.slideshowIntervalMs;
}

export const GALLERY_SLIDESHOW_TRANSITION_OPTIONS = [
  "slide",
  "fade",
  "zoom",
  "none",
] as const;
export type GallerySlideshowTransition =
  (typeof GALLERY_SLIDESHOW_TRANSITION_OPTIONS)[number];

export const GALLERY_SLIDESHOW_TRANSITION_LABELS: Record<
  GallerySlideshowTransition,
  string
> = {
  slide: "Slide",
  fade: "Fade",
  zoom: "Zoom",
  none: "Instant",
};

export function isGallerySlideshowTransition(
  value: unknown,
): value is GallerySlideshowTransition {
  return (
    typeof value === "string" &&
    GALLERY_SLIDESHOW_TRANSITION_OPTIONS.includes(
      value as GallerySlideshowTransition,
    )
  );
}

export function resolveGallerySlideshowTransition(
  value: unknown,
): GallerySlideshowTransition {
  return isGallerySlideshowTransition(value)
    ? value
    : DEFAULT_GALLERY_VIEW.slideshowTransition;
}

export const GALLERY_SLIDESHOW_TRANSITION_MS = 520;

export function resolveGallerySlideshowTransitionMs(
  transition: GallerySlideshowTransition,
): number {
  return transition === "none" ? 0 : GALLERY_SLIDESHOW_TRANSITION_MS;
}

export type GalleryLayoutMode = "grid" | "dense" | "list";

export type ComfyGalleryViewPreferences = {
  sort: ComfyGallerySort;
  pageSize: GalleryPageSize;
  slideshowIntervalMs: GallerySlideshowIntervalMs;
  slideshowTransition: GallerySlideshowTransition;
  layout: GalleryLayoutMode;
};

export const DEFAULT_GALLERY_VIEW: ComfyGalleryViewPreferences = {
  sort: "queued-desc",
  pageSize: 12,
  slideshowIntervalMs: 5000,
  slideshowTransition: "slide",
  layout: "grid",
};

export function isGallerySlideshowIntervalMs(
  value: unknown,
): value is GallerySlideshowIntervalMs {
  return (
    typeof value === "number" &&
    GALLERY_SLIDESHOW_INTERVAL_OPTIONS.includes(
      value as GallerySlideshowIntervalMs,
    )
  );
}

export function isGalleryPageSize(value: unknown): value is GalleryPageSize {
  return (
    value === GALLERY_PAGE_SIZE_ALL ||
    (typeof value === "number" &&
      GALLERY_PAGE_SIZE_OPTIONS.includes(value as (typeof GALLERY_PAGE_SIZE_OPTIONS)[number]))
  );
}

export function resolveGalleryPageSize(
  pageSize: GalleryPageSize,
  totalItems: number,
): number {
  if (pageSize === GALLERY_PAGE_SIZE_ALL) {
    return Math.max(totalItems, 1);
  }

  return pageSize;
}

export const COMFYUI_GALLERY_VIEW_KEY = "comfyui-gallery-view-v1";

function readLegacyLocalStorageGallery(): ComfyGalleryEntry[] {
  const parsed = readBrowserValue<unknown>(COMFYUI_GALLERY_KEY);
  return Array.isArray(parsed) ? (parsed as ComfyGalleryEntry[]) : [];
}

export function loadComfyGallery(): ComfyGalleryEntry[] {
  if (typeof window === "undefined") {
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
  options?: { syncRemote?: boolean },
): void {
  if (typeof window === "undefined") {
    return;
  }

  setGalleryCache(entries);
  notifyGalleryUpdated();
  scheduleUserAnalyticsSync();
  if (options?.syncRemote !== false) {
    void import("./auto-storage-sync").then(({ scheduleAutoPushStorage }) =>
      scheduleAutoPushStorage(),
    );
  }
  void import("./tab-sync").then(({ broadcastTabSync }) => broadcastTabSync({ type: "gallery-updated" }));
  void initGalleryStore().then(() => persistGalleryCache());
}

export async function saveComfyGalleryAsync(entries: ComfyGalleryEntry[]): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  setGalleryCache(entries);
  await initGalleryStore();
  await persistGalleryCache();
  notifyGalleryUpdated();
  scheduleUserAnalyticsSync();
}

export function clearComfyGallery(): void {
  if (typeof window === "undefined") {
    return;
  }

  void clearGalleryDb();
  notifyGalleryUpdated();
}

export function filterComfyGalleryEntries(
  entries: ComfyGalleryEntry[],
  filter: ComfyGalleryFilter,
): ComfyGalleryEntry[] {
  const query = filter.query?.trim();

  let filtered = entries.filter((entry) => {
    if (filter.favoritesOnly && !entry.favorite) {
      return false;
    }
    if (filter.status && filter.status !== "all" && entry.status !== filter.status) {
      return false;
    }
    if (filter.tool?.trim() && entry.tool !== filter.tool.trim()) {
      return false;
    }
    if (filter.unreviewedOnly && entry.reviewRating) {
      return false;
    }
    if (filter.projectId?.trim() && entry.projectId !== filter.projectId.trim()) {
      return false;
    }
    if (filter.visionTagsOnly && !(entry.visionTags?.length ?? 0)) {
      return false;
    }
    if (filter.focusEntryId?.trim() && entry.id !== filter.focusEntryId.trim()) {
      return false;
    }
    if (
      filter.derivativeOfEntryId?.trim() &&
      entry.parentGalleryEntryId !== filter.derivativeOfEntryId.trim()
    ) {
      return false;
    }
    if (filter.derivedKind && entry.derivedKind !== filter.derivedKind) {
      return false;
    }
    if (query && !filter.semanticSearch) {
      const needle = query.toLowerCase();
      const haystack = [
        entry.prompt,
        entry.negativePrompt,
        entry.tool,
        entry.model,
        entry.promptId,
        entry.statusMessage,
        entry.visionTags?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(needle)) {
        return false;
      }
    }
    return true;
  });

  if (query && filter.semanticSearch) {
    filtered = filterBySemanticQuery(
      filtered,
      query,
      (entry) =>
        [
          entry.prompt,
          entry.negativePrompt,
          entry.tool,
          entry.model,
          entry.promptId,
          entry.statusMessage,
          entry.visionTags?.join(" "),
        ]
          .filter(Boolean)
          .join(" "),
    );
  }

  if (filter.similarToEntryId) {
    const reference = entries.find((entry) => entry.id === filter.similarToEntryId);
    if (reference) {
      filtered = orderGalleryBySimilarity(filtered, reference);
    }
  }

  return filtered;
}

export function paginateGalleryEntries<T>(
  entries: T[],
  page: number,
  pageSize: number,
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
  sort: ComfyGallerySort = DEFAULT_GALLERY_VIEW.sort,
): ComfyGalleryEntry[] {
  const sorted = [...entries];

  switch (sort) {
    case "queued-asc":
      return sorted.sort((a, b) => a.queuedAt - b.queuedAt);
    case "completed-desc":
      return sorted.sort(
        (a, b) =>
          (b.completedAt ?? b.queuedAt) - (a.completedAt ?? a.queuedAt),
      );
    case "tool-asc":
      return sorted.sort(
        (a, b) =>
          (a.tool ?? "").localeCompare(b.tool ?? "") || b.queuedAt - a.queuedAt,
      );
    case "favorites-first":
      return sorted.sort(
        (a, b) =>
          Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
          b.queuedAt - a.queuedAt,
      );
    case "queued-desc":
    default:
      return sorted.sort((a, b) => b.queuedAt - a.queuedAt);
  }
}

export function loadGalleryViewPreferences(): ComfyGalleryViewPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_GALLERY_VIEW;
  }

  try {
    const parsed = readBrowserValue<Partial<ComfyGalleryViewPreferences>>(
      COMFYUI_GALLERY_VIEW_KEY,
    );
    if (!parsed) {
      return DEFAULT_GALLERY_VIEW;
    }
    const pageSize = isGalleryPageSize(parsed.pageSize)
      ? parsed.pageSize
      : DEFAULT_GALLERY_VIEW.pageSize;

    const sortValues: ComfyGallerySort[] = [
      "queued-desc",
      "queued-asc",
      "completed-desc",
      "tool-asc",
      "favorites-first",
    ];
    const sort = sortValues.includes(parsed.sort as ComfyGallerySort)
      ? (parsed.sort as ComfyGallerySort)
      : DEFAULT_GALLERY_VIEW.sort;
    const slideshowIntervalMs = normalizeGallerySlideshowIntervalMs(
      parsed.slideshowIntervalMs,
    );
    const slideshowTransition = resolveGallerySlideshowTransition(
      parsed.slideshowTransition,
    );
    const layoutValues: GalleryLayoutMode[] = ["grid", "dense", "list"];
    const layout = layoutValues.includes(parsed.layout as GalleryLayoutMode)
      ? (parsed.layout as GalleryLayoutMode)
      : DEFAULT_GALLERY_VIEW.layout;

    return { sort, pageSize, slideshowIntervalMs, slideshowTransition, layout };
  } catch {
    return DEFAULT_GALLERY_VIEW;
  }
}

export function saveGalleryViewPreferences(
  preferences: ComfyGalleryViewPreferences,
): void {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserValue(COMFYUI_GALLERY_VIEW_KEY, preferences);
}

export function uniqueGalleryTools(entries: ComfyGalleryEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.tool).filter(Boolean) as string[])].sort();
}

export function addComfyGalleryEntry(
  input: Omit<ComfyGalleryEntry, "id" | "queuedAt" | "images" | "status"> & {
    status?: ComfyGalleryJobStatus;
    images?: ComfyOutputImage[];
  },
): ComfyGalleryEntry {
  const userId = getActiveUserId();
  const entry: ComfyGalleryEntry = {
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
    status: input.status ?? "pending",
    images: input.images ?? [],
    ...input,
    userId: input.userId ?? userId ?? undefined,
  };

  saveComfyGallery([entry, ...loadComfyGallery()]);
  return entry;
}

export function updateComfyGalleryEntryById(
  id: string,
  patch: Partial<
    Pick<
      ComfyGalleryEntry,
      | "status"
      | "statusMessage"
      | "queuePosition"
      | "progressValue"
      | "progressMax"
      | "progressNode"
      | "completedAt"
      | "images"
      | "comfyUrl"
      | "favorite"
      | "historyId"
      | "negativePrompt"
      | "queueParams"
      | "reviewRating"
      | "projectId"
      | "visionTags"
    >
  >,
): ComfyGalleryEntry | null {
  const entries = loadComfyGallery();
  let updated: ComfyGalleryEntry | null = null;
  const next = entries.map((entry) => {
    if (entry.id !== id) {
      return entry;
    }
    updated = { ...entry, ...patch };
    return updated;
  });
  if (!updated) {
    return null;
  }
  if (patch.status === "completed") {
    const prior = entries.find((entry) => entry.id === id);
    if (prior && prior.status !== "completed") {
      void import("./notification-center").then(({ pushNotification }) =>
        pushNotification({
          title: "ComfyUI job completed",
          body: updated!.prompt.slice(0, 80),
          href: "/gallery",
          kind: "job",
        }),
      );
    }
  }
  saveComfyGallery(next);
  return updated;
}

function galleryPatchIsEphemeralProgress(
  patch: Partial<ComfyGalleryEntry>,
): boolean {
  if (patch.status === "completed" || patch.status === "error") {
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
  return keys.every((key) =>
    [
      "status",
      "statusMessage",
      "queuePosition",
      "progressValue",
      "progressMax",
      "progressNode",
      "comfyUrl",
    ].includes(key),
  );
}

export function updateComfyGalleryByPromptId(
  promptId: string,
  patch: Partial<
    Pick<
      ComfyGalleryEntry,
      "status" | "statusMessage" | "queuePosition" | "progressValue" | "progressMax" | "progressNode" | "completedAt" | "images" | "comfyUrl" | "favorite" | "historyId" | "queueParams" | "reviewRating" | "projectId"
    >
  >,
): ComfyGalleryEntry | null {
  let updated: ComfyGalleryEntry | null = null;
  const next = loadComfyGallery().map((entry) => {
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
    loadComfyGallery().map((entry) =>
      entry.id === id ? { ...entry, favorite: !entry.favorite } : entry,
    ),
  );
}

export function setGalleryReviewRating(
  id: string,
  reviewRating: ComfyGalleryEntry["reviewRating"],
): void {
  saveComfyGallery(
    loadComfyGallery().map((entry) =>
      entry.id === id ? { ...entry, reviewRating, favorite: reviewRating === 5 ? true : entry.favorite } : entry,
    ),
  );
}

export function removeComfyGalleryEntry(id: string): void {
  saveComfyGallery(loadComfyGallery().filter((entry) => entry.id !== id));
}

export function removeComfyGalleryEntries(ids: string[]): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  saveComfyGallery(loadComfyGallery().filter((entry) => !idSet.has(entry.id)));
}

export function setComfyGalleryProjectIds(
  ids: string[],
  projectId: string | undefined,
): void {
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map((entry) =>
      idSet.has(entry.id) ? { ...entry, projectId: projectId || undefined } : entry,
    ),
  );
}

export function setComfyGalleryFavorites(ids: string[], favorite: boolean): void {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  saveComfyGallery(
    loadComfyGallery().map((entry) =>
      idSet.has(entry.id) ? { ...entry, favorite } : entry,
    ),
  );
}

export function galleryEntryViewUrls(entry: ComfyGalleryEntry): string[] {
  return entry.images.map((image) => buildComfyViewPath(entry.comfyUrl, image));
}

export function galleryEntryThumbUrls(entry: ComfyGalleryEntry): string[] {
  return entry.images.map((image) =>
    buildComfyViewPath(entry.comfyUrl, image, { width: GALLERY_THUMB_WIDTH }),
  );
}

export function galleryEntryStripThumbUrls(entry: ComfyGalleryEntry): string[] {
  return entry.images.map((image) =>
    buildComfyViewPath(entry.comfyUrl, image, { width: GALLERY_STRIP_THUMB_WIDTH }),
  );
}

export function galleryEntryLightboxUrls(entry: ComfyGalleryEntry): string[] {
  return entry.images.map((image) =>
    buildComfyViewPath(entry.comfyUrl, image, { width: GALLERY_LIGHTBOX_WIDTH }),
  );
}

export function galleryEntryPrimaryViewUrl(entry: ComfyGalleryEntry): string | null {
  return galleryEntryViewUrls(entry)[0] ?? null;
}

export function galleryEntryPrimaryThumbUrl(entry: ComfyGalleryEntry): string | null {
  return galleryEntryThumbUrls(entry)[0] ?? null;
}

export function galleryEntryPrimaryThumbSrcSet(entry: ComfyGalleryEntry): string | null {
  const image = entry.images[0];
  if (!image) {
    return null;
  }
  return buildComfyViewSrcSet(entry.comfyUrl, image);
}

export function galleryEntryPrimaryLqipUrl(entry: ComfyGalleryEntry): string | null {
  const image = entry.images[0];
  if (!image) {
    return null;
  }
  return buildComfyViewPath(entry.comfyUrl, image, { width: GALLERY_LQIP_WIDTH });
}

export type GalleryLightboxPlaylist = {
  images: string[];
  titles: string[];
};

export function buildGalleryLightboxPlaylist(
  entries: readonly ComfyGalleryEntry[],
  titleLength = 120,
): GalleryLightboxPlaylist {
  const images: string[] = [];
  const titles: string[] = [];

  for (const entry of entries) {
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      continue;
    }

    const title = entry.prompt.slice(0, titleLength);
    for (const url of urls) {
      images.push(url);
      titles.push(title);
    }
  }

  return { images, titles };
}

export function resolveGalleryLightboxOpenIndex(
  entries: readonly ComfyGalleryEntry[],
  entryId: string,
  imageIndex = 0,
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
