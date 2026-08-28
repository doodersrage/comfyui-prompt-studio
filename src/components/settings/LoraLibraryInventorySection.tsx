'use client';

import { useMemo, useState } from 'react';
import ComfyLoraPreviewThumb from '@/components/ComfyLoraPreviewThumb';
import type { ComfyLoraInventoryFile } from '@/lib/comfyui-object-info-cache';

type LoraLibraryInventorySectionProps = {
  comfyUrl?: string;
  libraryFilenames: Set<string>;
  inventoryLoras: ComfyLoraInventoryFile[];
  inventoryLoading: boolean;
  inventoryError: string | null;
  onRefreshInventory: () => void | Promise<void>;
  onAddFromInventory: (filename: string) => void;
};

export default function LoraLibraryInventorySection({
  comfyUrl,
  libraryFilenames,
  inventoryLoras,
  inventoryLoading,
  inventoryError,
  onRefreshInventory,
  onAddFromInventory,
}: LoraLibraryInventorySectionProps) {
  const [inventoryFilter, setInventoryFilter] = useState('');

  const availableToAdd = useMemo(() => {
    const filter = inventoryFilter.trim().toLowerCase();
    return inventoryLoras.filter(file => {
      if (libraryFilenames.has(file.name.toLowerCase())) {
        return false;
      }
      if (!filter) {
        return true;
      }
      return file.name.toLowerCase().includes(filter);
    });
  }, [inventoryFilter, inventoryLoras, libraryFilenames]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          Available in ComfyUI
          {inventoryLoras.length > 0 ? (
            <span className="text-[var(--text-muted)]"> · {inventoryLoras.length} files</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => void onRefreshInventory()}
          disabled={inventoryLoading}
          className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
        >
          {inventoryLoading ? 'Refreshing…' : 'Refresh inventory'}
        </button>
      </div>
      <input
        value={inventoryFilter}
        onChange={event => setInventoryFilter(event.target.value)}
        placeholder="Filter LoRA filenames…"
        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
      />
      {inventoryError ? <p className="text-xs ui-status-danger">{inventoryError}</p> : null}
      {inventoryLoading && inventoryLoras.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Loading LoRA inventory…</p>
      ) : availableToAdd.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {inventoryLoras.length === 0
            ? 'No LoRAs reported by ComfyUI yet.'
            : inventoryFilter.trim()
              ? 'No matching unused LoRAs.'
              : 'All inventory LoRAs are already in the library.'}
        </p>
      ) : (
        <ul className="ui-scroll-region sidebar-scroll max-h-56 space-y-1 overflow-y-auto">
          {availableToAdd.map(file => (
            <li
              key={file.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-muted)]/80"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <ComfyLoraPreviewThumb
                  filename={file.name}
                  pathIndex={file.pathIndex}
                  comfyUrl={comfyUrl}
                />
                <code className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                  {file.name}
                </code>
              </span>
              <button
                type="button"
                onClick={() => onAddFromInventory(file.name)}
                className="shrink-0 rounded-lg border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
