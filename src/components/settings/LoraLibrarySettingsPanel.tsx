'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/ViewState';
import {
  comfyLoraPreviewSrc,
  fetchComfyLoraInventoryFiles,
  fetchLoraTriggerPhrase,
  type ComfyLoraInventoryFile,
} from '@/lib/comfyui-object-info-cache';
import {
  createEmptyLoraLibraryEntry,
  createLoraLibraryEntryFromFilename,
  describeLoraStack,
  resolveActiveLoraStack,
  type LoraLibraryEntry,
} from '@/lib/lora-stack';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import LoraSearchDownloadPanel from '@/components/settings/LoraSearchDownloadPanel';

type LoraLibrarySettingsPanelProps = {
  library: LoraLibraryEntry[] | undefined;
  comfyUrl?: string;
  onChange: (next: LoraLibraryEntry[]) => void;
  onStatus?: (message: string) => void;
};

export default function LoraLibrarySettingsPanel({
  library,
  comfyUrl,
  onChange,
  onStatus,
}: LoraLibrarySettingsPanelProps) {
  const entries = useMemo(() => library ?? [], [library]);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  const [inventoryLoras, setInventoryLoras] = useState<ComfyLoraInventoryFile[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState('');

  const refreshInventory = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const loras = [
        ...((await fetchComfyLoraInventoryFiles({
          comfyUrl: comfyUrl?.trim() || undefined,
          forceRefresh: true,
        })) ?? []),
      ]
        .map(file => ({
          name: file.name.trim(),
          pathIndex: file.pathIndex,
        }))
        .filter(file => file.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setInventoryLoras(loras);
      if (loras.length === 0) {
        setInventoryError(
          'Could not load ComfyUI LoRA inventory. Start ComfyUI or check Settings → ComfyUI URL.'
        );
      }
    } catch {
      setInventoryLoras([]);
      setInventoryError('Could not load ComfyUI LoRA inventory.');
    } finally {
      setInventoryLoading(false);
    }
  }, [comfyUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refreshInventory();
    });
  }, [refreshInventory]);

  const libraryFilenames = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      const name = entry.tokenValue?.trim();
      if (name) {
        set.add(name.toLowerCase());
      }
    }
    return set;
  }, [entries]);

  const inventoryNames = useMemo(() => inventoryLoras.map(file => file.name), [inventoryLoras]);

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

  const activeSummary = useMemo(
    () => describeLoraStack(resolveActiveLoraStack(entries)),
    [entries]
  );

  const updateEntry = useCallback(
    (index: number, patch: Partial<LoraLibraryEntry>) => {
      onChange(
        entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry))
      );
    },
    [entries, onChange]
  );

  const addBlank = useCallback(() => {
    onChange([...entries, createEmptyLoraLibraryEntry()]);
  }, [entries, onChange]);

  const addFromInventory = useCallback(
    (filename: string) => {
      const entry = createLoraLibraryEntryFromFilename(filename, entries);
      const next = [...entries, entry];
      entriesRef.current = next;
      onChange(next);
      void fetchLoraTriggerPhrase(filename, comfyUrl?.trim() || undefined).then(trigger => {
        if (!trigger) {
          return;
        }
        onChange(
          entriesRef.current.map(item =>
            item.tokenValue === filename && !item.triggerPhrase.trim()
              ? { ...item, triggerPhrase: trigger }
              : item
          )
        );
      });
    },
    [comfyUrl, entries, onChange]
  );

  const removeEntry = useCallback(
    (index: number) => {
      onChange(entries.filter((_, entryIndex) => entryIndex !== index));
    },
    [entries, onChange]
  );

  const moveEntry = useCallback(
    (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) {
        return;
      }
      const next = [...entries];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      onChange(
        next.map((entry, order) => ({
          ...entry,
          order,
        }))
      );
    },
    [entries, onChange]
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Pick LoRAs from your ComfyUI inventory, then set ID and label. New entries start unchecked —
        turn on <span className="text-[var(--text-secondary)]">Enabled</span> for Settings defaults,
        or use the tool sidebar <span className="text-[var(--text-secondary)]">LoRA stack</span> for
        the current session.
      </p>

      <LoraSearchDownloadPanel
        comfyUrl={comfyUrl}
        libraryFilenames={libraryFilenames}
        onAddToLibrary={addFromInventory}
        onRefreshInventory={refreshInventory}
        onStatus={onStatus}
      />

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
            onClick={() => void refreshInventory()}
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI preview is a remote binary */}
                  <img
                    src={comfyLoraPreviewSrc(file.name, file.pathIndex, comfyUrl)}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 shrink-0 rounded object-cover"
                    onError={event => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                  <code className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                    {file.name}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={() => addFromInventory(file.name)}
                  className="shrink-0 rounded-lg border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)]">Library entries</p>
          <button
            type="button"
            onClick={addBlank}
            className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Add blank
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          For Qwen Lightning, set ID to{' '}
          <code className="rounded bg-[var(--bg-muted)] px-1 text-[var(--accent-text)]">
            LIGHTNING
          </code>{' '}
          (suggested automatically for Lightning filenames).
        </p>
        {entries.length > 0 ? (
          <p className="ui-surface-inset text-xs text-[var(--text-secondary)]">{activeSummary}</p>
        ) : null}
        {entries.length === 0 ? (
          <EmptyState
            compact
            icon="catalog"
            title="No LoRA entries yet"
            description="Add from the inventory list above, or create a blank entry and pick a file."
            action={{
              label: 'Add blank',
              onClick: addBlank,
            }}
          />
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, index) => {
              const enabled = entry.enabled !== false;
              const strengthModel = entry.strengthModel ?? 1;
              const strengthClip = entry.strengthClip ?? 1;
              const tokenOptions = (() => {
                const current = entry.tokenValue?.trim() ?? '';
                const set = new Set(inventoryNames);
                if (current && !set.has(current)) {
                  return [current, ...inventoryNames];
                }
                return inventoryNames;
              })();
              const selectedFile = inventoryLoras.find(file => file.name === entry.tokenValue);
              return (
                <li
                  key={`${entry.id}-${index}`}
                  className={`ui-surface-inset space-y-2 transition-opacity ${
                    enabled ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={event => updateEntry(index, { enabled: event.target.checked })}
                          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
                        />
                        Enabled
                      </label>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveEntry(index, -1)}
                        disabled={index === 0}
                        aria-label="Move LoRA up"
                        className="rounded-lg border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-default)] disabled:hover:text-[var(--text-muted)]"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEntry(index, 1)}
                        disabled={index === entries.length - 1}
                        aria-label="Move LoRA down"
                        className="rounded-lg border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border-default)] disabled:hover:text-[var(--text-muted)]"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <label className="space-y-1 text-xs text-[var(--text-muted)]">
                    LoRA file
                    <span className="flex items-center gap-2">
                      {selectedFile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={comfyLoraPreviewSrc(
                            selectedFile.name,
                            selectedFile.pathIndex,
                            comfyUrl
                          )}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 shrink-0 rounded object-cover"
                          onError={event => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <select
                        value={entry.tokenValue}
                        onChange={event => updateEntry(index, { tokenValue: event.target.value })}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                      >
                        <option value="">Select a LoRA…</option>
                        {tokenOptions.map(name => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                      ID
                      <input
                        value={entry.id}
                        onChange={event => updateEntry(index, { id: event.target.value })}
                        placeholder="portrait-style"
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                      Label
                      <input
                        value={entry.label}
                        onChange={event => updateEntry(index, { label: event.target.value })}
                        placeholder="Portrait style LoRA"
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center justify-between gap-2">
                      Trigger phrase
                      <button
                        type="button"
                        onClick={() => {
                          const filename = entry.tokenValue?.trim();
                          if (!filename) {
                            return;
                          }
                          void fetchLoraTriggerPhrase(filename, comfyUrl?.trim() || undefined).then(
                            trigger => {
                              if (trigger) {
                                updateEntry(index, { triggerPhrase: trigger });
                              }
                            }
                          );
                        }}
                        className="type-caption ui-text-link"
                      >
                        From metadata
                      </button>
                    </span>
                    <input
                      value={entry.triggerPhrase}
                      onChange={event => updateEntry(index, { triggerPhrase: event.target.value })}
                      placeholder="activation tags from the safetensors header"
                      className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center justify-between">
                        <span>Model strength</span>
                        <span className="font-mono text-[var(--text-secondary)]">
                          {strengthModel.toFixed(2)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={strengthModel}
                        onChange={event =>
                          updateEntry(index, {
                            strengthModel: Number(event.target.value),
                          })
                        }
                        className="h-8 w-full cursor-pointer accent-[var(--accent)]"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center justify-between">
                        <span>Clip strength</span>
                        <span className="font-mono text-[var(--text-secondary)]">
                          {strengthClip.toFixed(2)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={strengthClip}
                        onChange={event =>
                          updateEntry(index, {
                            strengthClip: Number(event.target.value),
                          })
                        }
                        className="h-8 w-full cursor-pointer accent-[var(--accent)]"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs text-[var(--accent-text)]">
                      {entry.id.trim() ? `{{LORA_${entry.id.trim()}}}` : '{{LORA_<id>}}'}
                    </code>
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--tint-danger-border)] hover:text-[var(--tint-danger-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--tint-danger-text)]"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
