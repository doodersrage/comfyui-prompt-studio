import type { ComfyGalleryFilter, ComfyGallerySort } from './comfyui-gallery';

export type GalleryUrlState = {
  filter: Partial<ComfyGalleryFilter>;
  sort?: ComfyGallerySort;
  projectFilterId?: string;
};

const SORT_VALUES: ComfyGallerySort[] = [
  'queued-desc',
  'queued-asc',
  'completed-desc',
  'tool-asc',
  'favorites-first',
  'rating-desc',
];

function isSort(value: string | null): value is ComfyGallerySort {
  return Boolean(value && SORT_VALUES.includes(value as ComfyGallerySort));
}

function parseMinRating(value: string | null): ComfyGalleryFilter['minRating'] | undefined {
  if (!value) {
    return undefined;
  }
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) {
    return n;
  }
  return undefined;
}

/** Read shareable gallery view params from the current URL (filter/sort/project). */
export function parseGalleryUrlState(params: URLSearchParams): GalleryUrlState {
  const filter: Partial<ComfyGalleryFilter> = {};
  const q = params.get('q')?.trim();
  if (q) {
    filter.query = q;
  }
  const focus = params.get('focus')?.trim();
  if (focus) {
    filter.focusEntryId = focus;
  }
  if (params.get('review') === '1') {
    filter.reviewMode = true;
    filter.unreviewedOnly = true;
  }
  if (params.get('unreviewed') === '1') {
    filter.unreviewedOnly = true;
    filter.reviewMode = true;
  }
  const status = params.get('status');
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error' ||
    status === 'all'
  ) {
    filter.status = status;
  }
  const tool = params.get('tool')?.trim();
  if (tool) {
    filter.tool = tool;
  }
  const model = params.get('model')?.trim();
  if (model) {
    filter.model = model;
  }
  const minRating = parseMinRating(params.get('minRating'));
  if (minRating) {
    filter.minRating = minRating;
  }
  if (params.get('fav') === '1') {
    filter.favoritesOnly = true;
  }
  if (params.get('atRisk') === '1') {
    filter.atRiskOnly = true;
  }
  const media = params.get('media');
  if (media === 'image' || media === 'video' || media === 'all') {
    filter.mediaKind = media;
  }

  const sortRaw = params.get('sort');
  const sort = isSort(sortRaw) ? sortRaw : undefined;
  const project = params.get('project');
  const projectFilterId = project === null ? undefined : project;

  return { filter, sort, projectFilterId };
}

/** Write shareable gallery view params (preserves unrelated query keys like lightbox/pickFor). */
export function applyGalleryUrlState(
  params: URLSearchParams,
  state: {
    filter: ComfyGalleryFilter;
    sort: ComfyGallerySort;
    projectFilterId: string;
  }
): void {
  const { filter, sort, projectFilterId } = state;

  const setOrDelete = (key: string, value: string | undefined) => {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  };

  setOrDelete('q', filter.query?.trim() || undefined);
  setOrDelete('focus', filter.focusEntryId?.trim() || undefined);
  setOrDelete('review', filter.reviewMode ? '1' : undefined);
  setOrDelete('unreviewed', filter.unreviewedOnly && !filter.reviewMode ? '1' : undefined);
  setOrDelete('status', filter.status && filter.status !== 'all' ? filter.status : undefined);
  setOrDelete('tool', filter.tool?.trim() || undefined);
  setOrDelete('model', filter.model?.trim() || undefined);
  setOrDelete('minRating', filter.minRating ? String(filter.minRating) : undefined);
  setOrDelete('fav', filter.favoritesOnly ? '1' : undefined);
  setOrDelete('atRisk', filter.atRiskOnly ? '1' : undefined);
  setOrDelete(
    'media',
    filter.mediaKind && filter.mediaKind !== 'all' ? filter.mediaKind : undefined
  );
  setOrDelete('sort', sort !== 'queued-desc' ? sort : undefined);
  setOrDelete('project', projectFilterId.trim() || undefined);
}
