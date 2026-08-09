import type { GalleryLineageGroup } from './gallery-lineage-groups';
import type { ComfyGalleryEntry } from './comfyui-gallery';

export type GalleryCardsRow = {
  kind: 'cards';
  entries: ComfyGalleryEntry[];
};

export type GalleryLineageRow = {
  kind: 'lineage';
  groupId: string;
  root: ComfyGalleryEntry;
  derivatives: ComfyGalleryEntry[];
  collapsed: boolean;
};

export type GalleryDisplayRow = GalleryCardsRow | GalleryLineageRow;

export function buildGalleryDisplayRows(
  lineageGroups: GalleryLineageGroup[] | null,
  visibleEntries: ComfyGalleryEntry[],
  collapsedLineageGroups: ReadonlySet<string>,
  columns: number
): GalleryDisplayRow[] {
  const safeColumns = Math.max(1, columns);

  if (!lineageGroups) {
    const rows: GalleryDisplayRow[] = [];
    for (let index = 0; index < visibleEntries.length; index += safeColumns) {
      rows.push({
        kind: 'cards',
        entries: visibleEntries.slice(index, index + safeColumns),
      });
    }
    return rows;
  }

  const rows: GalleryDisplayRow[] = [];
  const pending: ComfyGalleryEntry[] = [];

  const flushPending = () => {
    while (pending.length > 0) {
      rows.push({
        kind: 'cards',
        entries: pending.splice(0, safeColumns),
      });
    }
  };

  for (const group of lineageGroups) {
    if (group.derivatives.length === 0) {
      pending.push(group.root);
      if (pending.length >= safeColumns) {
        flushPending();
      }
      continue;
    }

    flushPending();
    rows.push({
      kind: 'lineage',
      groupId: group.root.id,
      root: group.root,
      derivatives: group.derivatives,
      collapsed: collapsedLineageGroups.has(group.root.id),
    });
  }

  flushPending();
  return rows;
}

export function countGalleryDisplayEntries(rows: readonly GalleryDisplayRow[]): number {
  let count = 0;
  for (const row of rows) {
    if (row.kind === 'cards') {
      count += row.entries.length;
      continue;
    }
    count += 1 + (row.collapsed ? 0 : row.derivatives.length);
  }
  return count;
}
