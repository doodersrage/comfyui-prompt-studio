"use client";

import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import {
  listSelectableLoraLibraryEntries,
  resolveSessionActiveLoraIds,
} from "@/lib/lora-stack";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/Field";

type LoraStackSessionPickerProps = {
  sessionActiveLoraIds?: string[];
  onChange: (ids: string[] | undefined) => void;
  checkboxClassName?: string;
};

export default function LoraStackSessionPicker({
  sessionActiveLoraIds,
  onChange,
  checkboxClassName,
}: LoraStackSessionPickerProps) {
  const library = loadComfyUiSettings().loraLibrary;
  const selectable = listSelectableLoraLibraryEntries(library);
  const activeIds = resolveSessionActiveLoraIds(library, sessionActiveLoraIds);
  const activeSet = new Set(activeIds);
  const sessionOverride = sessionActiveLoraIds !== undefined;

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
      <FieldLabel hint="Checked LoRAs load at queue time (including Lightning models). Clear turns baked-in pack LoRAs off.">
        Active LoRAs
      </FieldLabel>
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
            Follow Settings defaults
          </Button>
        ) : (
          <p className="type-caption self-center text-zinc-500">
            Following Settings enabled flags
          </p>
        )}
      </div>
    </div>
  );
}
