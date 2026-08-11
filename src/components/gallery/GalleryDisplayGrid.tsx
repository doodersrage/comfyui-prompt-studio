'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import GalleryLineageBlock from '@/components/gallery/GalleryLineageBlock';
import {
  buildGalleryDisplayRows,
  countGalleryDisplayEntries,
  type GalleryDisplayRow,
} from '@/lib/gallery-display-rows';
import type { GalleryLineageGroup } from '@/lib/gallery-lineage-groups';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import {
  galleryGridColumnCount,
  shouldVirtualizeGalleryGrid,
} from '@/components/gallery/VirtualizedGalleryGrid';

export { shouldVirtualizeGalleryGrid };

function galleryRowGridStyle(columns: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
}

type GalleryDisplayGridProps = {
  visibleEntries: ComfyGalleryEntry[];
  lineageGroups: GalleryLineageGroup[] | null;
  collapsedLineageGroups: Set<string>;
  onToggleLineageGroup: (rootId: string) => void;
  layout: GalleryLayoutMode;
  compact: boolean;
  gridClassName: string;
  virtualGridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
};

function CardsRow({
  entries,
  layout,
  columns,
  gridClassName,
  renderCard,
}: {
  entries: ComfyGalleryEntry[];
  layout: GalleryLayoutMode;
  columns: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
}) {
  if (layout === 'list') {
    return (
      <div className="flex flex-col gap-3">
        {entries.map(entry => (
          <div key={entry.id}>{renderCard(entry)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${gridClassName} overflow-visible`} style={galleryRowGridStyle(columns)}>
      {entries.map(entry => (
        <div key={entry.id} className="min-w-0">
          {renderCard(entry)}
        </div>
      ))}
    </div>
  );
}

function DisplayRowView({
  row,
  layout,
  columns,
  gridClassName,
  onToggleLineageGroup,
  renderCard,
}: {
  row: GalleryDisplayRow;
  layout: GalleryLayoutMode;
  columns: number;
  gridClassName: string;
  onToggleLineageGroup: (rootId: string) => void;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
}) {
  if (row.kind === 'cards') {
    return (
      <CardsRow
        entries={row.entries}
        layout={layout}
        columns={columns}
        gridClassName={gridClassName}
        renderCard={renderCard}
      />
    );
  }

  return (
    <GalleryLineageBlock
      group={{ root: row.root, derivatives: row.derivatives }}
      collapsed={row.collapsed}
      onToggle={() => onToggleLineageGroup(row.groupId)}
      layout={layout}
      columns={columns}
      gridClassName={gridClassName}
      renderCard={entry => renderCard(entry)}
    />
  );
}

function VirtualizedDisplayRows({
  rows,
  layout,
  compact,
  columns,
  gridClassName,
  virtualGridClassName,
  onToggleLineageGroup,
  renderCard,
  estimateRowHeight,
}: {
  rows: GalleryDisplayRow[];
  layout: GalleryLayoutMode;
  compact: boolean;
  columns: number;
  gridClassName: string;
  virtualGridClassName: string;
  onToggleLineageGroup: (rootId: string) => void;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
  estimateRowHeight: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setScrollMargin(node.offsetTop);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const gapPx =
    layout === 'list' ? (compact ? 12 : 16) : compact ? 8 : layout === 'dense' ? 10 : 16;
  const rowEstimate = estimateRowHeight + gapPx;

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => rowEstimate,
    overscan: 3,
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [columns, rowEstimate, rows.length, virtualizer]);

  return (
    <div ref={listRef} className="relative w-full">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = rows[virtualRow.index];
          if (!row) {
            return null;
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              <div
                className={
                  layout === 'list'
                    ? 'pb-3'
                    : layout === 'dense'
                      ? `${virtualGridClassName} pb-2`
                      : `${virtualGridClassName} pb-4`
                }
              >
                <DisplayRowView
                  row={row}
                  layout={layout}
                  columns={columns}
                  gridClassName={gridClassName}
                  onToggleLineageGroup={onToggleLineageGroup}
                  renderCard={renderCard}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GalleryDisplayGrid({
  visibleEntries,
  lineageGroups,
  collapsedLineageGroups,
  onToggleLineageGroup,
  layout,
  compact,
  gridClassName,
  virtualGridClassName,
  renderCard,
}: GalleryDisplayGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setWidth(node.clientWidth || window.innerWidth);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const columns = useMemo(
    () => galleryGridColumnCount(layout, compact, width),
    [compact, layout, width]
  );

  const rows = useMemo(
    () => buildGalleryDisplayRows(lineageGroups, visibleEntries, collapsedLineageGroups, columns),
    [collapsedLineageGroups, columns, lineageGroups, visibleEntries]
  );

  const virtualize = shouldVirtualizeGalleryGrid(countGalleryDisplayEntries(rows));
  const estimateRowHeight = layout === 'list' ? 180 : layout === 'dense' || compact ? 280 : 360;

  if (!virtualize) {
    return (
      <div
        ref={containerRef}
        className={layout === 'list' ? 'flex flex-col gap-3 overflow-visible' : 'overflow-visible'}
      >
        {rows.map((row, index) => (
          <DisplayRowView
            key={row.kind === 'lineage' ? `lineage-${row.groupId}` : `cards-${index}`}
            row={row}
            layout={layout}
            columns={columns}
            gridClassName={gridClassName}
            onToggleLineageGroup={onToggleLineageGroup}
            renderCard={renderCard}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <VirtualizedDisplayRows
        rows={rows}
        layout={layout}
        compact={compact}
        columns={columns}
        gridClassName={gridClassName}
        virtualGridClassName={virtualGridClassName}
        onToggleLineageGroup={onToggleLineageGroup}
        renderCard={renderCard}
        estimateRowHeight={estimateRowHeight}
      />
    </div>
  );
}
