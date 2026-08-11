'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';

export const HISTORY_VIRTUALIZE_THRESHOLD = 48;
/** Initial estimate only — measureElement corrects per-row height. */
export const HISTORY_ROW_ESTIMATE_PX = 480;

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

  useEffect(() => {
    virtualizer.measure();
  }, [entries.length, virtualizer]);

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
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className="pb-[var(--block-gap)]">{renderEntry(entry)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
