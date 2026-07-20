import type { ComfyGalleryEntry } from "./comfyui-gallery";

export type GalleryLineageGroup = {
  root: ComfyGalleryEntry;
  derivatives: ComfyGalleryEntry[];
};

export function buildGalleryLineageGroups(
  entries: ComfyGalleryEntry[],
): GalleryLineageGroup[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const childrenByParent = new Map<string, ComfyGalleryEntry[]>();

  for (const entry of entries) {
    const parentId = entry.parentGalleryEntryId?.trim();
    if (!parentId || !byId.has(parentId)) {
      continue;
    }
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(entry);
    childrenByParent.set(parentId, siblings);
  }

  const claimed = new Set<string>();
  const groups: GalleryLineageGroup[] = [];

  for (const entry of entries) {
    if (claimed.has(entry.id)) {
      continue;
    }

    const parentId = entry.parentGalleryEntryId?.trim();
    if (parentId && byId.has(parentId)) {
      continue;
    }

    const derivatives = (childrenByParent.get(entry.id) ?? [])
      .slice()
      .sort((left, right) => left.queuedAt - right.queuedAt);

    for (const derivative of derivatives) {
      claimed.add(derivative.id);
    }
    claimed.add(entry.id);

    groups.push({ root: entry, derivatives });
  }

  return groups;
}

export function galleryLineageGroupingEnabled(
  filter: Pick<
    import("./comfyui-gallery").ComfyGalleryFilter,
    "derivativeOfEntryId" | "focusEntryId"
  >,
): boolean {
  return !filter.derivativeOfEntryId?.trim() && !filter.focusEntryId?.trim();
}
