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
          ? 'space-y-3 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3'
          : 'col-span-full space-y-3 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3'
      }
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-violet-300/80">
          Lineage · {group.derivatives.length + 1} outputs
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-0.6 text-[10px] font-medium text-violet-300 backdrop-blur-sm transition hover:border-violet-400/45 hover:bg-violet-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45 active:scale-[0.98]"
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
                    ? `ml-3 border-l border-violet-500/20 pl-3${index === 0 ? '' : ' opacity-65 transition group-hover/card:opacity-100'}`
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
