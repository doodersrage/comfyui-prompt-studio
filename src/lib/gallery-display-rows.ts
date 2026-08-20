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

/**
 * Both `buildGalleryDisplayRows` and `paginateGalleryEntriesWithGroups` treat `group.entries[0]`
 * as a group's "anchor" — the one member whose position in `sortedSource` decides which single
 * page the whole group renders on. That's only reliable if `entries[0]` actually IS the member
 * that appears earliest when walking `sortedSource` in its real order.
 *
 * `groupGalleryExperiments` already preserves `sortedSource`'s order, but `groupGalleryQueueRuns`
 * sorts its own `entries` ascending by `queuedAt` (oldest first) to detect clustering windows —
 * the opposite of `sortedSource`'s default newest-first order. Left uncorrected, a run-group's
 * "anchor" would be its OLDEST member, which `sortedSource` walks past LAST rather than first.
 * `buildGalleryDisplayRows` still claims (hides) every member on every page regardless of where
 * the anchor lands, so with the wrong anchor the block renders once on some far-later page while
 * claiming its members away from every page before that — which, watched from any earlier page,
 * looks exactly like the block being "stuck" since page 1.
 *
 * Call this once, right after combining groups from any mix of grouping functions, before handing
 * them to `buildGalleryDisplayRows` or `paginateGalleryEntriesWithGroups`. It's a no-op for a
 * group whose entries already match `sortedSource`'s order.
 */
export function normalizeExperimentGroupAnchors<T extends { id: string }>(
  groups: readonly ExperimentGroup[],
  sortedSource: readonly T[]
): ExperimentGroup[] {
  const positionById = new Map(sortedSource.map((entry, index) => [entry.id, index]));
  const bySortedPosition = (a: ComfyGalleryEntry, b: ComfyGalleryEntry) =>
    (positionById.get(a.id) ?? 0) - (positionById.get(b.id) ?? 0);
  return groups.map(group => ({
    ...group,
    entries: [...group.entries].sort(bySortedPosition),
  }));
}

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
      if (group.entries.length < 2) {
        continue;
      }
      // Every member is claimed on every page — including ones that fall on a page other
      // than where the block itself renders — so a group split across a pagination boundary
      // never leaks a stray, ungrouped single-entry card on its "other" page.
      for (const entry of group.entries) {
        claimedByExperiment.add(entry.id);
      }
      // `group.entries` preserves the caller's sort order (newest-first), so entries[0] is
      // the group's newest member and, in practice, the page a user would expect the block
      // to live on. Anchoring the block to that one page — and rendering ALL of the group's
      // entries there rather than only the subset present in this page's `visibleEntries` —
      // is what keeps the same experiment from rendering again on the next page whenever its
      // members straddle a pagination boundary (which they often do, since best-of-N/variant
      // runs are generated in a tight burst and land right at a page's edge).
      const anchor = group.entries[0];
      if (!anchor || !visibleById.has(anchor.id)) {
        continue;
      }
      experimentRows.push({
        kind: 'experiment',
        groupId: group.id,
        label: group.label,
        entries: group.entries,
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

export type GalleryPaginationResult = {
  items: ComfyGalleryEntry[];
  page: number;
  totalPages: number;
  totalItems: number;
};

/**
 * Like a plain flat-index `entries.slice(...)` pagination, but treats each qualifying experiment
 * group as an indivisible unit anchored at its newest member's position (matching
 * `buildGalleryDisplayRows`'s own anchor rule) instead of letting a page boundary fall in the
 * middle of it.
 *
 * Without this, index-based pagination has no idea a group's other members are about to get
 * pulled onto a different page by `buildGalleryDisplayRows` — so once two or more sizeable
 * groups (say, 15+ entries each from a best-of-N burst) land near a page boundary, ALL of the
 * index range that would have belonged to the next page can end up "claimed" by those groups'
 * non-anchor members, leaving that page completely empty even though later pages still have
 * unclaimed content. This plans page boundaries around each group's true size up front so that
 * never happens: a page's budget accounts for a group as `group.entries.length` slots, and a
 * group that's larger than `pageSize` still gets a page entirely to itself rather than splitting.
 *
 * `sortedSource` is expected to contain each entry id at most once, but upstream merge/sync/poll
 * gaps have been known to hand this function the same id twice (e.g. a still-in-flight entry that
 * appears both in a cached page and in a freshly merged batch). If a group's anchor id shows up
 * more than once, the planning walk below would previously push a full-weight "slot" for it once
 * per occurrence — qualifying the SAME group for placement on multiple independent pages, so the
 * exact same experiment block would render again on every later page it happened to land on. We
 * dedupe by id up front (keeping each id's first occurrence, consistent with `sortedSource`'s
 * newest-first convention) so no id — and critically, no anchor — can ever be planned twice.
 */
export function paginateGalleryEntriesWithGroups(
  sortedSource: readonly ComfyGalleryEntry[],
  experimentGroups: ExperimentGroup[] | null | undefined,
  page: number,
  pageSize: number
): GalleryPaginationResult {
  const seenIds = new Set<string>();
  const dedupedSource: ComfyGalleryEntry[] = [];
  for (const entry of sortedSource) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    dedupedSource.push(entry);
  }

  const anchorWeight = new Map<string, number>();
  const nonAnchorMemberOf = new Set<string>();
  const anchorGroupEntries = new Map<string, ComfyGalleryEntry[]>();

  if (experimentGroups?.length) {
    for (const group of experimentGroups) {
      if (group.entries.length < 2) {
        continue;
      }
      const anchor = group.entries[0];
      if (!anchor) {
        continue;
      }
      anchorWeight.set(anchor.id, group.entries.length);
      anchorGroupEntries.set(anchor.id, group.entries);
      for (const member of group.entries) {
        if (member.id !== anchor.id) {
          nonAnchorMemberOf.add(member.id);
        }
      }
    }
  }

  // Weighted planning pass, in original order: a normal entry (or a group's anchor) is one
  // "slot"; an anchor's slot carries its group's full size as weight. Non-anchor members are
  // skipped here entirely — they're accounted for via their anchor's weight and re-expanded
  // into the page's actual `items` below.
  const planned: Array<{ slot: ComfyGalleryEntry; weight: number }> = [];
  for (const entry of dedupedSource) {
    if (nonAnchorMemberOf.has(entry.id)) {
      continue;
    }
    planned.push({ slot: entry, weight: anchorWeight.get(entry.id) ?? 1 });
  }

  const pages: ComfyGalleryEntry[][] = [];
  let current: ComfyGalleryEntry[] = [];
  let currentWeight = 0;
  for (const { slot, weight } of planned) {
    // Always keep at least one slot on the current page before checking the budget, so a single
    // oversized group still lands on a page of its own instead of never fitting anywhere.
    if (current.length > 0 && currentWeight + weight > pageSize) {
      pages.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(slot);
    currentWeight += weight;
  }
  if (current.length > 0 || pages.length === 0) {
    pages.push(current);
  }

  const totalPages = pages.length;
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageSlots = pages[safePage - 1] ?? [];

  const items: ComfyGalleryEntry[] = [];
  for (const slot of pageSlots) {
    const expanded = anchorGroupEntries.get(slot.id);
    if (expanded) {
      items.push(...expanded);
    } else {
      items.push(slot);
    }
  }

  return {
    items,
    page: safePage,
    totalPages,
    totalItems: dedupedSource.length,
  };
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
