"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/ViewState";
import { fetchComfyObjectInfoModelsCached } from "@/lib/comfyui-object-info-cache";
import {
  createEmptyLoraLibraryEntry,
  createLoraLibraryEntryFromFilename,
  describeLoraStack,
  resolveActiveLoraStack,
  type LoraLibraryEntry,
} from "@/lib/lora-stack";

type LoraLibrarySettingsPanelProps = {
  library: LoraLibraryEntry[] | undefined;
  comfyUrl?: string;
  onChange: (next: LoraLibraryEntry[]) => void;
};

export default function LoraLibrarySettingsPanel({
  library,
  comfyUrl,
  onChange,
}: LoraLibrarySettingsPanelProps) {
  const entries = library ?? [];
  const [inventoryLoras, setInventoryLoras] = useState<string[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState("");

  const refreshInventory = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const models = await fetchComfyObjectInfoModelsCached({
        comfyUrl: comfyUrl?.trim() || undefined,
        forceRefresh: true,
      });
      const loras = [...(models?.loras ?? [])]
        .map((name) => name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      setInventoryLoras(loras);
      if (!models) {
        setInventoryError("Could not load ComfyUI LoRA inventory.");
      } else if (loras.length === 0) {
        setInventoryError(
          "ComfyUI responded, but no LoRA filenames were listed on LoraLoader / LoraLoaderModelOnly.",
        );
      }
    } catch {
      setInventoryLoras([]);
      setInventoryError("Could not load ComfyUI LoRA inventory.");
    } finally {
      setInventoryLoading(false);
    }
  }, [comfyUrl]);

  useEffect(() => {
    void refreshInventory();
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

  const availableToAdd = useMemo(() => {
    const filter = inventoryFilter.trim().toLowerCase();
    return inventoryLoras.filter((name) => {
      if (libraryFilenames.has(name.toLowerCase())) {
        return false;
      }
      if (!filter) {
        return true;
      }
      return name.toLowerCase().includes(filter);
    });
  }, [inventoryFilter, inventoryLoras, libraryFilenames]);

  const activeSummary = useMemo(
    () => describeLoraStack(resolveActiveLoraStack(entries)),
    [entries],
  );

  const updateEntry = useCallback(
    (index: number, patch: Partial<LoraLibraryEntry>) => {
      onChange(
        entries.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, ...patch } : entry,
        ),
      );
    },
    [entries, onChange],
  );

  const addBlank = useCallback(() => {
    onChange([...entries, createEmptyLoraLibraryEntry()]);
  }, [entries, onChange]);

  const addFromInventory = useCallback(
    (filename: string) => {
      onChange([...entries, createLoraLibraryEntryFromFilename(filename, entries)]);
    },
    [entries, onChange],
  );

  const removeEntry = useCallback(
    (index: number) => {
      onChange(entries.filter((_, entryIndex) => entryIndex !== index));
    },
    [entries, onChange],
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
        })),
      );
    },
    [entries, onChange],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Pick LoRAs from your ComfyUI inventory, then set ID and label yourself.
        Enabled entries always load; disabled ones with{" "}
        <span className="text-zinc-300">Auto from prompt</span> load only when the
        positive prompt contains their trigger phrase. Entries also sync to{" "}
        <code className="rounded bg-zinc-800 px-1 text-violet-300">
          {"{{LORA_<id>}}"}
        </code>{" "}
        when you save ComfyUI settings.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-400">
            Available in ComfyUI
            {inventoryLoras.length > 0 ? (
              <span className="text-zinc-600"> · {inventoryLoras.length} files</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => void refreshInventory()}
            disabled={inventoryLoading}
            className="text-xs text-violet-300 transition hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-50"
          >
            {inventoryLoading ? "Refreshing…" : "Refresh inventory"}
          </button>
        </div>
        <input
          value={inventoryFilter}
          onChange={(event) => setInventoryFilter(event.target.value)}
          placeholder="Filter LoRA filenames…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        {inventoryError ? (
          <p className="text-xs text-rose-300">{inventoryError}</p>
        ) : null}
        {inventoryLoading && inventoryLoras.length === 0 ? (
          <p className="text-xs text-zinc-600">Loading LoRA inventory…</p>
        ) : availableToAdd.length === 0 ? (
          <p className="text-xs text-zinc-600">
            {inventoryLoras.length === 0
              ? "No LoRAs reported by ComfyUI yet."
              : inventoryFilter.trim()
                ? "No matching unused LoRAs."
                : "All inventory LoRAs are already in the library."}
          </p>
        ) : (
          <ul className="ui-surface-inset max-h-56 space-y-1 overflow-y-auto p-2">
            {availableToAdd.map((filename) => (
              <li
                key={filename}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-900/80"
              >
                <code className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                  {filename}
                </code>
                <button
                  type="button"
                  onClick={() => addFromInventory(filename)}
                  className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-violet-500 hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
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
          <p className="text-xs text-zinc-400">Library entries</p>
          <button
            type="button"
            onClick={addBlank}
            className="text-xs text-violet-300 transition hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
          >
            Add blank
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          For Qwen Lightning, set ID to{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">LIGHTNING</code>{" "}
          (suggested automatically for Lightning filenames).
        </p>
        {entries.length > 0 ? (
          <p className="ui-surface-inset text-xs text-zinc-300">
            {activeSummary}
            {entries.some(
              (entry) => entry.enabled === false && entry.autoFromPrompt,
            )
              ? " · + auto at queue when prompt matches"
              : ""}
          </p>
        ) : null}
        {entries.length === 0 ? (
          <EmptyState
            compact
            icon="catalog"
            title="No LoRA entries yet"
            description="Add from the inventory list above, or create a blank entry and pick a file."
            action={{
              label: "Add blank",
              onClick: addBlank,
            }}
          />
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, index) => {
              const enabled = entry.enabled !== false;
              const autoFromPrompt = entry.autoFromPrompt === true;
              const hasTrigger = Boolean(entry.triggerPhrase?.trim());
              const strengthModel = entry.strengthModel ?? 1;
              const strengthClip = entry.strengthClip ?? 1;
              const tokenOptions = (() => {
                const current = entry.tokenValue?.trim() ?? "";
                const set = new Set(inventoryLoras);
                if (current && !set.has(current)) {
                  return [current, ...inventoryLoras];
                }
                return inventoryLoras;
              })();
              return (
                <li
                  key={`${entry.id}-${index}`}
                  className={`ui-surface-inset space-y-2 transition-opacity ${
                    enabled ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) =>
                            updateEntry(index, { enabled: event.target.checked })
                          }
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                        />
                        Enabled
                      </label>
                      <label
                        className={`flex items-center gap-2 text-xs ${
                          hasTrigger ? "text-zinc-300" : "text-zinc-500"
                        }`}
                        title={
                          hasTrigger
                            ? "When disabled, load if the prompt contains the trigger phrase"
                            : "Set a trigger phrase to use Auto from prompt"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={autoFromPrompt}
                          disabled={!hasTrigger && !autoFromPrompt}
                          onChange={(event) =>
                            updateEntry(index, {
                              autoFromPrompt: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                        Auto from prompt
                      </label>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveEntry(index, -1)}
                        disabled={index === 0}
                        aria-label="Move LoRA up"
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition hover:border-violet-500 hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-700 disabled:hover:text-zinc-400"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEntry(index, 1)}
                        disabled={index === entries.length - 1}
                        aria-label="Move LoRA down"
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition hover:border-violet-500 hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-700 disabled:hover:text-zinc-400"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  <label className="space-y-1 text-xs text-zinc-400">
                    LoRA file
                    <select
                      value={entry.tokenValue}
                      onChange={(event) =>
                        updateEntry(index, { tokenValue: event.target.value })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                    >
                      <option value="">Select a LoRA…</option>
                      {tokenOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-zinc-400">
                      ID
                      <input
                        value={entry.id}
                        onChange={(event) =>
                          updateEntry(index, { id: event.target.value })
                        }
                        placeholder="portrait-style"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-zinc-400">
                      Label
                      <input
                        value={entry.label}
                        onChange={(event) =>
                          updateEntry(index, { label: event.target.value })
                        }
                        placeholder="Portrait style LoRA"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                      />
                    </label>
                  </div>
                  <label className="space-y-1 text-xs text-zinc-400">
                    Trigger phrase
                    <input
                      value={entry.triggerPhrase}
                      onChange={(event) =>
                        updateEntry(index, {
                          triggerPhrase: event.target.value,
                        })
                      }
                      placeholder="portrait lighting, soft skin"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-zinc-400">
                      <span className="flex items-center justify-between">
                        <span>Model strength</span>
                        <span className="font-mono text-zinc-300">
                          {strengthModel.toFixed(2)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={strengthModel}
                        onChange={(event) =>
                          updateEntry(index, {
                            strengthModel: Number(event.target.value),
                          })
                        }
                        className="h-8 w-full cursor-pointer accent-violet-500"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-zinc-400">
                      <span className="flex items-center justify-between">
                        <span>Clip strength</span>
                        <span className="font-mono text-zinc-300">
                          {strengthClip.toFixed(2)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={strengthClip}
                        onChange={(event) =>
                          updateEntry(index, {
                            strengthClip: Number(event.target.value),
                          })
                        }
                        className="h-8 w-full cursor-pointer accent-violet-500"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs text-violet-300">
                      {entry.id.trim()
                        ? `{{LORA_${entry.id.trim()}}}`
                        : "{{LORA_<id>}}"}
                    </code>
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-rose-500 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
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
