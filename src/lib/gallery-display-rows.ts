import type { ExperimentGroup } from './experiment-groups';
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

export type GalleryExperimentRow = {
  kind: 'experiment';
  groupId: string;
  label: string;
  entries: ComfyGalleryEntry[];
  winnerEntryId?: string;
  collapsed: boolean;
};

export type GalleryDisplayRow = GalleryCardsRow | GalleryLineageRow | GalleryExperimentRow;

export type BuildGalleryDisplayRowsOptions = {
  experimentGroups?: ExperimentGroup[] | null;
  collapsedExperimentGroups?: ReadonlySet<string>;
  winners?: Record<string, { entryId: string }>;
};

export function buildGalleryDisplayRows(
  lineageGroups: GalleryLineageGroup[] | null,
  visibleEntries: ComfyGalleryEntry[],
  collapsedLineageGroups: ReadonlySet<string>,
  columns: number,
  options?: BuildGalleryDisplayRowsOptions
): GalleryDisplayRow[] {
  const safeColumns = Math.max(1, columns);
  const experimentGroups = options?.experimentGroups ?? null;
  const collapsedExperimentGroups = options?.collapsedExperimentGroups ?? new Set<string>();
  const winners = options?.winners ?? {};

  const claimedByExperiment = new Set<string>();
  const experimentRows: GalleryExperimentRow[] = [];

  if (experimentGroups?.length) {
    const visibleById = new Map(visibleEntries.map(entry => [entry.id, entry]));
    for (const group of experimentGroups) {
      const entries = group.entries
        .map(entry => visibleById.get(entry.id))
        .filter((entry): entry is ComfyGalleryEntry => Boolean(entry));
      if (entries.length < 2) {
        continue;
      }
      for (const entry of entries) {
        claimedByExperiment.add(entry.id);
      }
      experimentRows.push({
        kind: 'experiment',
        groupId: group.id,
        label: group.label,
        entries,
        winnerEntryId: winners[group.id]?.entryId,
        collapsed: collapsedExperimentGroups.has(group.id),
      });
    }
  }

  const filterUnclaimed = (entries: ComfyGalleryEntry[]) =>
    entries.filter(entry => !claimedByExperiment.has(entry.id));

  if (!lineageGroups) {
    const rows: GalleryDisplayRow[] = [...experimentRows];
    const remaining = filterUnclaimed(visibleEntries);
    for (let index = 0; index < remaining.length; index += safeColumns) {
      rows.push({
        kind: 'cards',
        entries: remaining.slice(index, index + safeColumns),
      });
    }
    return rows;
  }

  const rows: GalleryDisplayRow[] = [...experimentRows];
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
    if (claimedByExperiment.has(group.root.id)) {
      continue;
    }
    const derivatives = group.derivatives.filter(entry => !claimedByExperiment.has(entry.id));
    if (derivatives.length === 0) {
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
      derivatives,
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
    if (row.kind === 'experiment') {
      count += row.collapsed ? 1 : row.entries.length;
      continue;
    }
    count += 1 + (row.collapsed ? 0 : row.derivatives.length);
  }
  return count;
}
