'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ExperimentGroup } from '@/lib/experiment-groups';

export const EXPERIMENT_VIRTUALIZE_THRESHOLD = 48;
export const EXPERIMENT_ROW_ESTIMATE_PX = 380;

type VirtualizedExperimentListProps = {
  groups: ExperimentGroup[];
  renderGroup: (group: ExperimentGroup) => ReactNode;
};

export function shouldVirtualizeExperimentList(count: number): boolean {
  return count >= EXPERIMENT_VIRTUALIZE_THRESHOLD;
}

export default function VirtualizedExperimentList({
  groups,
  renderGroup,
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
              key={group.id}
              className="absolute left-0 top-0 w-full pb-[var(--block-gap)]"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {renderGroup(group)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
