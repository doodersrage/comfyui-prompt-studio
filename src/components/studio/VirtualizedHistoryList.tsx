'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';

export const HISTORY_VIRTUALIZE_THRESHOLD = 48;
export const HISTORY_ROW_ESTIMATE_PX = 220;

type VirtualizedHistoryListProps = {
  entries: PromptHistoryEntry[];
  renderEntry: (entry: PromptHistoryEntry) => ReactNode;
};

export function shouldVirtualizeHistoryList(count: number): boolean {
  return count >= HISTORY_VIRTUALIZE_THRESHOLD;
}

export default function VirtualizedHistoryList({
  entries,
  renderEntry,
}: VirtualizedHistoryListProps) {
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
    count: entries.length,
    estimateSize: () => HISTORY_ROW_ESTIMATE_PX,
    overscan: 6,
    scrollMargin,
  });

  return (
    <div ref={parentRef} className="relative w-full">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const entry = entries[virtualRow.index];
          if (!entry) {
            return null;
          }
          return (
            <div
              key={entry.id}
              className="absolute left-0 top-0 w-full pb-[var(--block-gap)]"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {renderEntry(entry)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
