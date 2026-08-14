'use client';

import { useEffect, useState } from 'react';
import { loadComfyUiSettings, saveComfyUiSettings } from '@/lib/comfyui-settings';
import {
  clampLoraStrength,
  clearSessionLoraStrengthOverride,
  listSelectableLoraLibraryEntries,
  normalizeLoraLibraryEntry,
  pruneSessionLoraStrengthOverride,
  resolveLoraStrengths,
  resolveSessionActiveLoraIds,
  type LoraLibraryEntry,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora-stack';
import {
  hasSessionLoraIdsForModel,
  resolveEffectiveSessionLoraIds,
  resolveModelDefaultLoraIds,
  type ModelLoraMap,
  type SessionActiveLoraIdsByModel,
} from '@/lib/model-lora-map';
import {
  filterLorasForSelectedModel,
  isLoraCompatibleWithModel,
  loraModelFilterLabel,
} from '@/lib/lora-model-compat';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadSettingsCache } from '@/lib/settings-cache';
import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import ComfyLoraPreviewThumb from '@/components/ComfyLoraPreviewThumb';

type LoraStackSessionPickerProps = {
  model?: string;
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: SessionLoraStrengthOverrides;
  onChange: (ids: string[] | undefined) => void;
  onSessionStrengthOverridesChange?: (overrides: SessionLoraStrengthOverrides) => void;
  checkboxClassName?: string;
};

type PickerSnapshot = {
  library: LoraLibraryEntry[];
  model: string;
  modelLoraMap: ModelLoraMap | undefined;
  sessionActiveLoraIdsByModel: SessionActiveLoraIdsByModel | undefined;
};

type StrengthEditMode = 'session' | 'library';

function StrengthSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5" onClick={event => event.stopPropagation()}>
      <span className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-[var(--text-secondary)]">
          {value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="h-7 w-full cursor-pointer accent-[var(--accent)]"
      />
    </label>
  );
}

export default function LoraStackSessionPicker({
  model,
  sessionActiveLoraIds,
  sessionLoraStrengthOverrides = {},
  onChange,
  onSessionStrengthOverridesChange,
  checkboxClassName,
}: LoraStackSessionPickerProps) {
  const [snapshot, setSnapshot] = useState<PickerSnapshot | null>(null);
  const [tuningEntryId, setTuningEntryId] = useState<string | null>(null);
  const [strengthEditMode, setStrengthEditMode] = useState<StrengthEditMode>('session');
  const modelKey = model ?? '';
  const [showAllForModel, setShowAllForModel] = useState(modelKey);
  const [showAllLoras, setShowAllLoras] = useState(false);

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
  }, [model, sessionActiveLoraIds, sessionLoraStrengthOverrides]);

  if (showAllForModel !== modelKey) {
    setShowAllForModel(modelKey);
    setShowAllLoras(false);
  }

  const updateLibraryStrength = (
    entryId: string,
    patch: { strengthModel?: number; strengthClip?: number }
  ) => {
    const settings = loadComfyUiSettings();
    const library = (settings.loraLibrary ?? []).map(entry =>
      entry.id === entryId ? normalizeLoraLibraryEntry({ ...entry, ...patch }) : entry
    );
    saveComfyUiSettings({ ...settings, loraLibrary: library });
    setSnapshot(previous => (previous ? { ...previous, library } : previous));
  };

  const updateSessionStrength = (
    entry: LoraLibraryEntry,
    patch: { strengthModel?: number; strengthClip?: number }
  ) => {
    if (!onSessionStrengthOverridesChange) {
      return;
    }
    onSessionStrengthOverridesChange(
      pruneSessionLoraStrengthOverride(sessionLoraStrengthOverrides, entry.id, entry, patch)
    );
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
  const visible = filterLorasForSelectedModel(selectable, snapshot.model, {
    alwaysIncludeIds: activeIds,
    showAll: showAllLoras,
  });
  const hiddenCount = Math.max(0, selectable.length - visible.length);
  const activeSet = new Set(activeIds);
  const mismatchCount = selectable.filter(
    entry => activeSet.has(entry.id) && !isLoraCompatibleWithModel(entry, snapshot.model)
  ).length;
  const previewComfyUrl = loadComfyUiSettings().apiUrl;

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
              const found = selectable.find(item => item.id === id);
              return found?.label?.trim() || id;
            })
            .join(', ');

  if (selectable.length === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]">
        No LoRAs in your library yet. Add them under{' '}
        <a
          href="/settings?tab=comfyui&section=lora-library"
          className="ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          Settings → LoRA library
        </a>
        .
      </p>
    );
  }

  const tuningEntry =
    tuningEntryId !== null ? selectable.find(entry => entry.id === tuningEntryId) : undefined;

  return (
    <div className="space-y-3">
      <p className="type-caption leading-relaxed text-[var(--text-muted)]">
        Check LoRAs to load at queue time. Tap a row to tune strengths —{' '}
        <span className="text-[var(--text-secondary)]">This run</span> tweaks the session only;{' '}
        <span className="text-[var(--text-secondary)]">Default</span> updates your library.
      </p>
      {modelDefaultLabels !== null ? (
        <p className="type-caption text-[var(--text-muted)]">
          Model defaults: {modelDefaultLabels}
        </p>
      ) : null}

      {mismatchCount > 0 ? (
        <p className="type-caption ui-status-danger">
          {mismatchCount} selected LoRA{mismatchCount === 1 ? '' : 's'} look like a different family
          than {loraModelFilterLabel(snapshot.model)}.
        </p>
      ) : null}

      {hiddenCount > 0 || showAllLoras ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-caption text-[var(--text-muted)]">
            {showAllLoras
              ? `Showing all library LoRAs.`
              : `Showing LoRAs that look compatible with ${loraModelFilterLabel(snapshot.model)}.`}
            {!showAllLoras && hiddenCount > 0 ? ` ${hiddenCount} hidden.` : null}
          </p>
          <button
            type="button"
            onClick={() => setShowAllLoras(current => !current)}
            className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {showAllLoras ? 'Match model' : 'Show all'}
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">
          No LoRAs look compatible with {loraModelFilterLabel(snapshot.model)}. Show all to pick
          from the rest of your library.
        </p>
      ) : (
        <ul className="ui-scroll-region sidebar-scroll max-h-64 divide-y divide-[var(--border-subtle)]/80 overflow-y-auto rounded-xl border border-[var(--border-subtle)]/80">
          {visible.map(entry => {
            const checked = activeSet.has(entry.id);
            const isTuning = tuningEntryId === entry.id;
            const strengths = resolveLoraStrengths(entry, sessionLoraStrengthOverrides);
            const mismatched = checked && !isLoraCompatibleWithModel(entry, snapshot.model);

            return (
              <li
                key={entry.id}
                className={
                  checked
                    ? 'bg-[var(--accent-muted)]'
                    : isTuning
                      ? 'bg-[var(--bg-muted)]/30'
                      : undefined
                }
              >
                <div className="flex items-center gap-2.5 px-3 py-2.5">
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
                      'h-4 w-4 shrink-0 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]'
                    }
                  />
                  {entry.tokenValue ? (
                    <ComfyLoraPreviewThumb filename={entry.tokenValue} comfyUrl={previewComfyUrl} />
                  ) : null}
                  <button
                    type="button"
                    aria-expanded={isTuning}
                    onClick={() => {
                      setTuningEntryId(current => (current === entry.id ? null : entry.id));
                      setStrengthEditMode('session');
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-[var(--bg-muted)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-[var(--text-primary)]">
                        {entry.label || entry.id}
                      </span>
                      {mismatched ? (
                        <span className="block text-[10px] ui-status-danger">Family mismatch</span>
                      ) : null}
                    </span>
                    {checked || strengths.hasSessionOverride ? (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                        {strengths.strengthModel.toFixed(2)}/{strengths.strengthClip.toFixed(2)}
                        {strengths.hasSessionOverride ? (
                          <span className="ml-1 rounded bg-[var(--accent-muted)] px-1 text-[var(--accent-text)]">
                            run
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tuningEntry ? (
        <div className="ui-panel-accent space-y-3 px-3 py-3">
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {tuningEntry.label || tuningEntry.id}
            </p>
            <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">
              {tuningEntry.tokenValue}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <ChipButton
              active={strengthEditMode === 'session'}
              onClick={() => setStrengthEditMode('session')}
              className="w-full justify-center px-2 text-[11px]"
            >
              This run
            </ChipButton>
            <ChipButton
              active={strengthEditMode === 'library'}
              onClick={() => setStrengthEditMode('library')}
              className="w-full justify-center px-2 text-[11px]"
            >
              Default
            </ChipButton>
          </div>

          {(() => {
            const strengths = resolveLoraStrengths(tuningEntry, sessionLoraStrengthOverrides);
            const displayModel =
              strengthEditMode === 'session'
                ? strengths.strengthModel
                : clampLoraStrength(tuningEntry.strengthModel);
            const displayClip =
              strengthEditMode === 'session'
                ? strengths.strengthClip
                : clampLoraStrength(tuningEntry.strengthClip);

            return (
              <div className="space-y-3">
                <StrengthSlider
                  label="Model"
                  value={displayModel}
                  onChange={value => {
                    const clamped = clampLoraStrength(value);
                    if (strengthEditMode === 'session') {
                      updateSessionStrength(tuningEntry, { strengthModel: clamped });
                    } else {
                      updateLibraryStrength(tuningEntry.id, { strengthModel: clamped });
                      onSessionStrengthOverridesChange?.(
                        clearSessionLoraStrengthOverride(
                          sessionLoraStrengthOverrides,
                          tuningEntry.id
                        )
                      );
                    }
                  }}
                />
                <StrengthSlider
                  label="Clip"
                  value={displayClip}
                  onChange={value => {
                    const clamped = clampLoraStrength(value);
                    if (strengthEditMode === 'session') {
                      updateSessionStrength(tuningEntry, { strengthClip: clamped });
                    } else {
                      updateLibraryStrength(tuningEntry.id, { strengthClip: clamped });
                      onSessionStrengthOverridesChange?.(
                        clearSessionLoraStrengthOverride(
                          sessionLoraStrengthOverrides,
                          tuningEntry.id
                        )
                      );
                    }
                  }}
                />
              </div>
            );
          })()}

          {strengthEditMode === 'session' &&
          resolveLoraStrengths(tuningEntry, sessionLoraStrengthOverrides).hasSessionOverride ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onSessionStrengthOverridesChange?.(
                  clearSessionLoraStrengthOverride(sessionLoraStrengthOverrides, tuningEntry.id)
                );
              }}
            >
              Reset to library default
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange(visible.map(entry => entry.id))}
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
        ) : null}
      </div>
    </div>
  );
}
