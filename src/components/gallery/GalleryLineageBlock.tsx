'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { GalleryLineageGroup } from '@/lib/gallery-lineage-groups';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';

type GalleryLineageBlockProps = {
  group: GalleryLineageGroup;
  collapsed: boolean;
  onToggle: () => void;
  layout: GalleryLayoutMode;
  columns?: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry, options?: { derivativeIndex?: number }) => ReactNode;
};

export default function GalleryLineageBlock({
  group,
  collapsed,
  onToggle,
  layout,
  columns,
  gridClassName,
  renderCard,
}: GalleryLineageBlockProps) {
  const gridStyle: CSSProperties | undefined =
    layout !== 'list' && columns
      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      : undefined;
  return (
    <div
      className={
        layout === 'list'
          ? 'space-y-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-3'
          : 'col-span-full space-y-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-3'
      }
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--accent-text)]">
          Lineage · {group.derivatives.length + 1} outputs
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.6 text-[10px] font-medium text-[var(--accent-text)] backdrop-blur-sm transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
      <div className={layout === 'list' ? 'space-y-3' : gridClassName} style={gridStyle}>
        {renderCard(group.root)}
        {!collapsed
          ? group.derivatives.map((derivative, index) => (
              <div
                key={derivative.id}
                className={
                  layout === 'list'
                    ? `ml-3 border-l border-[var(--accent-border)] pl-3${index === 0 ? '' : ' opacity-65 transition group-hover/card:opacity-100'}`
                    : undefined
                }
              >
                {renderCard(derivative, { derivativeIndex: index })}
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
