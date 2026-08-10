'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const VARIATION_VIRTUALIZE_THRESHOLD = 24;
export const VARIATION_ROW_ESTIMATE_PX = 120;

type VirtualizedVariationResultsProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
};

export function shouldVirtualizeVariationResults(count: number): boolean {
  return count >= VARIATION_VIRTUALIZE_THRESHOLD;
}

export default function VirtualizedVariationResults<T>({
  items,
  renderItem,
  getKey,
}: VirtualizedVariationResultsProps<T>) {
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
    count: items.length,
    estimateSize: () => VARIATION_ROW_ESTIMATE_PX,
    overscan: 8,
    scrollMargin,
  });

  return (
    <div ref={parentRef} className="relative w-full">
      <ol className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const item = items[virtualRow.index];
          if (!item) {
            return null;
          }
          return (
            <li
              key={getKey(item, virtualRow.index)}
              className="absolute left-0 top-0 w-full list-none pb-3"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
