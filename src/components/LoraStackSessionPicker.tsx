"use client";

import { useEffect, useState } from "react";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import {
  listSelectableLoraLibraryEntries,
  resolveSessionActiveLoraIds,
  type LoraLibraryEntry,
} from "@/lib/lora-stack";
import {
  hasSessionLoraIdsForModel,
  resolveEffectiveSessionLoraIds,
  resolveModelDefaultLoraIds,
  type ModelLoraMap,
  type SessionActiveLoraIdsByModel,
} from "@/lib/model-lora-map";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { loadSettingsCache } from "@/lib/settings-cache";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/Field";

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

export default function LoraStackSessionPicker({
  model,
  sessionActiveLoraIds,
  onChange,
  checkboxClassName,
}: LoraStackSessionPickerProps) {
  // Read browser storage only after mount to avoid SSR/client hydration mismatches.
  const [snapshot, setSnapshot] = useState<PickerSnapshot | null>(null);

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

  if (!snapshot) {
    return (
      <p className="type-caption text-zinc-500">Loading LoRA stack…</p>
    );
  }

  const selectable = listSelectableLoraLibraryEntries(snapshot.library);
  const sessionOverride = hasSessionLoraIdsForModel(
    snapshot.sessionActiveLoraIdsByModel,
    snapshot.model,
  );
  const effectiveSessionIds = resolveEffectiveSessionLoraIds(
    sessionActiveLoraIds,
    snapshot.model,
    snapshot.modelLoraMap,
    snapshot.sessionActiveLoraIdsByModel,
  );
  const activeIds = resolveSessionActiveLoraIds(
    snapshot.library,
    effectiveSessionIds,
  );
  const activeSet = new Set(activeIds);

  const modelDefaultIds =
    !sessionOverride
      ? resolveModelDefaultLoraIds(snapshot.model, snapshot.modelLoraMap)
      : undefined;
  const modelDefaultLabels =
    modelDefaultIds === undefined
      ? null
      : modelDefaultIds.length === 0
        ? "none"
        : modelDefaultIds
            .map((id) => {
              const entry = selectable.find((item) => item.id === id);
              return entry?.label?.trim() || id;
            })
            .join(", ");

  if (selectable.length === 0) {
    return (
      <p className="type-caption text-zinc-500">
        No LoRAs in your library yet. Add them under{" "}
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
      <FieldLabel hint="Checked LoRAs load at queue time for the current model (including Lightning). Nothing is selected by default — picks are remembered per model.">
        Active LoRAs
      </FieldLabel>
      {modelDefaultLabels !== null ? (
        <p className="type-caption text-zinc-500">
          Using model defaults: {modelDefaultLabels}
        </p>
      ) : null}
      <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {selectable.map((entry) => {
          const checked = activeSet.has(entry.id);
          return (
            <li key={entry.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 transition hover:border-zinc-700 hover:bg-zinc-900/50 focus-within:border-violet-500/50">
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
                    "mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
                  }
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm font-medium text-zinc-200">
                    {entry.label || entry.id}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {entry.tokenValue}
                    {typeof entry.strengthModel === "number"
                      ? ` · ${entry.strengthModel.toFixed(2)}`
                      : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange(selectable.map((entry) => entry.id))}
        >
          Select all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
        {sessionOverride ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(undefined)}
          >
            Follow model defaults
          </Button>
        ) : (
          <p className="type-caption self-center text-zinc-500">
            {modelDefaultLabels !== null
              ? "Following model LoRA map"
              : "None selected by default"}
          </p>
        )}
      </div>
    </div>
  );
}
