'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

export function useGallerySelection(visibleEntries: ComfyGalleryEntry[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedEntries = useMemo(
    () => visibleEntries.filter(entry => selectedIdSet.has(entry.id)),
    [selectedIdSet, visibleEntries]
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return [...next];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(visibleEntries.map(entry => entry.id));
  }, [visibleEntries]);

  return {
    selectedIds,
    setSelectedIds,
    selectedIdSet,
    selectedEntries,
    toggleSelected,
    clearSelection,
    selectAllVisible,
  };
}
