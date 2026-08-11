'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ExperimentGroup } from '@/lib/experiment-groups';

export const EXPERIMENT_VIRTUALIZE_THRESHOLD = 48;
/** Initial estimate only — measureElement corrects per-row height. */
export const EXPERIMENT_ROW_ESTIMATE_PX = 380;

type VirtualizedExperimentListProps = {
  groups: ExperimentGroup[];
  renderGroup: (group: ExperimentGroup) => ReactNode;
  /** Remeasure when expand/collapse changes row height. */
  measureKey?: string | number | null;
};

export function shouldVirtualizeExperimentList(count: number): boolean {
  return count >= EXPERIMENT_VIRTUALIZE_THRESHOLD;
}

export default function VirtualizedExperimentList({
  groups,
  renderGroup,
  measureKey = null,
}: VirtualizedExperimentListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const updateScrollMargin = () => {
      setScrollMargin(parentRef.current?.offsetTop ?? 0);
    };
    updateScrollMargin();
    window.addEventListener('resize', updateScrollMargin);
    return () => window.removeEventListener('resize', updateScrollMargin);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: groups.length,
    estimateSize: () => EXPERIMENT_ROW_ESTIMATE_PX,
    overscan: 4,
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [groups.length, measureKey, virtualizer]);

  return (
    <div ref={parentRef} className="relative mt-4 w-full">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const group = groups[virtualRow.index];
          if (!group) {
            return null;
          }
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className="pb-[var(--block-gap)]">{renderGroup(group)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
