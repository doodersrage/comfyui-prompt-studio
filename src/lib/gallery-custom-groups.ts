/** Sentinel used by the gallery Group filter for entries with no custom group. */
export const GALLERY_UNGROUPED_FILTER = '__ungrouped__';

export const GALLERY_CUSTOM_GROUP_MAX_LENGTH = 80;

export function normalizeGalleryCustomGroupName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, GALLERY_CUSTOM_GROUP_MAX_LENGTH);
}

/** Reuse an existing group's casing when the typed name matches ignoring case. */
export function resolveGalleryCustomGroupName(
  name: string,
  existing: string[]
): string | undefined {
  const normalized = normalizeGalleryCustomGroupName(name);
  if (!normalized || normalized === GALLERY_UNGROUPED_FILTER) {
    return undefined;
  }
  const needle = normalized.toLowerCase();
  return existing.find(group => group.toLowerCase() === needle) ?? normalized;
}

export function uniqueGalleryCustomGroups(entries: Array<{ customGroup?: string }>): string[] {
  const groups = new Set<string>();
  for (const entry of entries) {
    const name = normalizeGalleryCustomGroupName(entry.customGroup ?? '');
    if (name) {
      groups.add(name);
    }
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
}

export function galleryEntryMatchesCustomGroup(
  entry: { customGroup?: string },
  filter: string | undefined
): boolean {
  const needle = filter?.trim();
  if (!needle) {
    return true;
  }
  const current = normalizeGalleryCustomGroupName(entry.customGroup ?? '');
  if (needle === GALLERY_UNGROUPED_FILTER) {
    return !current;
  }
  return current.toLowerCase() === needle.toLowerCase();
}
