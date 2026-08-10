'use client';

import { useEffect, useState } from 'react';
import { loadComfyUiSettings, saveComfyUiSettings } from '@/lib/comfyui-settings';
import {
  clampLoraStrength,
  DEFAULT_LORA_STRENGTH,
  listSelectableLoraLibraryEntries,
  normalizeLoraLibraryEntry,
  resolveSessionActiveLoraIds,
  type LoraLibraryEntry,
} from '@/lib/lora-stack';
import {
  hasSessionLoraIdsForModel,
  resolveEffectiveSessionLoraIds,
  resolveModelDefaultLoraIds,
  type ModelLoraMap,
  type SessionActiveLoraIdsByModel,
} from '@/lib/model-lora-map';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadSettingsCache } from '@/lib/settings-cache';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';

type LoraStackSessionPickerProps = {
  /** Current target model — used to refresh storage snapshot after model changes. */
  model?: string;
  /** Explicit per-model override for the current model; undefined = follow defaults. */
  sessionActiveLoraIds?: string[];
  onChange: (ids: string[] | undefined) => void;
  checkboxClassName?: string;
};

type PickerSnapshot = {
  library: LoraLibraryEntry[];
  model: string;
  modelLoraMap: ModelLoraMap | undefined;
  sessionActiveLoraIdsByModel: SessionActiveLoraIdsByModel | undefined;
};

function LoraStrengthSliders({
  strengthModel,
  strengthClip,
  onStrengthModelChange,
  onStrengthClipChange,
}: {
  strengthModel: number;
  strengthClip: number;
  onStrengthModelChange: (value: number) => void;
  onStrengthClipChange: (value: number) => void;
}) {
  return (
    <div
      className="grid gap-3 border-t border-[var(--border-subtle)]/80 pt-3 sm:grid-cols-2"
      onClick={event => event.stopPropagation()}
    >
      <label className="space-y-1 text-xs text-[var(--text-muted)]">
        <span className="flex items-center justify-between">
          <span>Model strength</span>
          <span className="font-mono text-[var(--text-secondary)]">{strengthModel.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={strengthModel}
          onChange={event => onStrengthModelChange(Number(event.target.value))}
          className="h-8 w-full cursor-pointer accent-violet-500"
        />
      </label>
      <label className="space-y-1 text-xs text-[var(--text-muted)]">
        <span className="flex items-center justify-between">
          <span>Clip strength</span>
          <span className="font-mono text-[var(--text-secondary)]">{strengthClip.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={strengthClip}
          onChange={event => onStrengthClipChange(Number(event.target.value))}
          className="h-8 w-full cursor-pointer accent-violet-500"
        />
      </label>
    </div>
  );
}

export default function LoraStackSessionPicker({
  model,
  sessionActiveLoraIds,
  onChange,
  checkboxClassName,
}: LoraStackSessionPickerProps) {
  // Read browser storage only after mount to avoid SSR/client hydration mismatches.
  const [snapshot, setSnapshot] = useState<PickerSnapshot | null>(null);
  const [expandedStrengthIds, setExpandedStrengthIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    scheduleAfterCommit(() => {
      const shared = loadSettingsCache().shared;
      setSnapshot({
        library: loadComfyUiSettings().loraLibrary ?? [],
        model: model ?? shared.model,
        modelLoraMap: shared.modelLoraMap,
        sessionActiveLoraIdsByModel: shared.sessionActiveLoraIdsByModel,
      });
    });
  }, [model, sessionActiveLoraIds]);

  const updateEntryStrength = (
    entryId: string,
    patch: { strengthModel?: number; strengthClip?: number }
  ) => {
    const settings = loadComfyUiSettings();
    const library = (settings.loraLibrary ?? []).map(entry =>
      entry.id === entryId ? normalizeLoraLibraryEntry({ ...entry, ...patch }) : entry
    );
    saveComfyUiSettings({ ...settings, loraLibrary: library });
    setSnapshot(previous =>
      previous
        ? {
            ...previous,
            library,
          }
        : previous
    );
  };

  const toggleStrengthPanel = (entryId: string) => {
    setExpandedStrengthIds(previous => {
      const next = new Set(previous);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  if (!snapshot) {
    return <p className="type-caption text-[var(--text-muted)]">Loading LoRA stack…</p>;
  }

  const selectable = listSelectableLoraLibraryEntries(snapshot.library);
  const sessionOverride = hasSessionLoraIdsForModel(
    snapshot.sessionActiveLoraIdsByModel,
    snapshot.model
  );
  const effectiveSessionIds = resolveEffectiveSessionLoraIds(
    sessionActiveLoraIds,
    snapshot.model,
    snapshot.modelLoraMap,
    snapshot.sessionActiveLoraIdsByModel
  );
  const activeIds = resolveSessionActiveLoraIds(snapshot.library, effectiveSessionIds);
  const activeSet = new Set(activeIds);
  const activeLabelList = activeIds
    .map(id => {
      const entry = selectable.find(item => item.id === id);
      return entry?.label?.trim() || id;
    })
    .join(', ');

  const modelDefaultIds = !sessionOverride
    ? resolveModelDefaultLoraIds(snapshot.model, snapshot.modelLoraMap)
    : undefined;
  const modelDefaultLabels =
    modelDefaultIds === undefined
      ? null
      : modelDefaultIds.length === 0
        ? 'none'
        : modelDefaultIds
            .map(id => {
              const entry = selectable.find(item => item.id === id);
              return entry?.label?.trim() || id;
            })
            .join(', ');

  if (selectable.length === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]">
        No LoRAs in your library yet. Add them under{' '}
        <a
          href="/settings?tab=comfyui&section=lora-library"
          className="text-violet-300 underline-offset-2 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          Settings → LoRA library
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FieldLabel hint="Checked LoRAs load at queue time. Adjust model and clip strength inline — changes apply to your LoRA library defaults.">
        Active LoRAs
      </FieldLabel>
      {modelDefaultLabels !== null ? (
        <p className="type-caption text-[var(--text-muted)]">
          Using model defaults: {modelDefaultLabels}
        </p>
      ) : null}
      <ul className="ui-scroll-region sidebar-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
        {selectable.map(entry => {
          const checked = activeSet.has(entry.id);
          const showStrengths = checked || expandedStrengthIds.has(entry.id);
          const strengthModel = entry.strengthModel ?? DEFAULT_LORA_STRENGTH;
          const strengthClip = entry.strengthClip ?? DEFAULT_LORA_STRENGTH;

          return (
            <li key={entry.id}>
              <div
                className={`space-y-3 rounded-lg border px-3 py-2 transition ${
                  checked
                    ? 'border-violet-500/40 bg-violet-500/5'
                    : 'border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(activeIds);
                        if (checked) {
                          next.delete(entry.id);
                        } else {
                          next.add(entry.id);
                        }
                        onChange([...next]);
                      }}
                      className={
                        checkboxClassName ??
                        'mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-violet-500'
                      }
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium text-[var(--text-primary)]">
                        {entry.label || entry.id}
                      </span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {entry.tokenValue}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleStrengthPanel(entry.id)}
                    aria-expanded={showStrengths}
                    className="shrink-0 rounded-lg border border-[var(--border-default)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
                  >
                    M {strengthModel.toFixed(2)} · C {strengthClip.toFixed(2)}
                  </button>
                </div>
                {showStrengths ? (
                  <LoraStrengthSliders
                    strengthModel={strengthModel}
                    strengthClip={strengthClip}
                    onStrengthModelChange={value =>
                      updateEntryStrength(entry.id, { strengthModel: clampLoraStrength(value) })
                    }
                    onStrengthClipChange={value =>
                      updateEntryStrength(entry.id, { strengthClip: clampLoraStrength(value) })
                    }
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        {activeIds.length === 0 ? (
          <span className="text-[var(--text-muted)]">Selected: none</span>
        ) : (
          <>
            <span className="font-medium text-[var(--text-secondary)]">Selected: </span>
            {activeLabelList}
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange(selectable.map(entry => entry.id))}
        >
          Select all
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>
          Clear
        </Button>
        {sessionOverride ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}>
            Follow model defaults
          </Button>
        ) : (
          <p className="type-caption self-center text-[var(--text-muted)]">
            {modelDefaultLabels !== null ? 'Following model LoRA map' : 'None selected by default'}
          </p>
        )}
      </div>
    </div>
  );
}
