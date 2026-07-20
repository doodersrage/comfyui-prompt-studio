"use client";

import { useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import {
  DEFAULT_QUEUE_PARAMS,
  loadQueueParamsSettings,
  saveQueueParamsSettings,
  type QueueParamsSettings,
} from "@/lib/queue-params-settings";
import { FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type QueueParamsPanelProps = {
  compact?: boolean;
};

export default function QueueParamsPanel({ compact = false }: QueueParamsPanelProps) {
  const [settings, setSettings] = useState<QueueParamsSettings>(DEFAULT_QUEUE_PARAMS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setSettings(loadQueueParamsSettings());
      setMounted(true);
    });
  }, []);

  if (!mounted) {
    return null;
  }

  const update = (patch: Partial<QueueParamsSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveQueueParamsSettings(next);
  };

  return (
    <div
      className={
        compact
          ? "space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"
          : "space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">Advanced queue params</p>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={settings.enabled === true}
            onChange={(event) => update({ enabled: event.target.checked })}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Override defaults
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["seed", "Seed (blank = random)"],
            ["width", "Width"],
            ["height", "Height"],
            ["cfg", "CFG"],
            ["steps", "Steps"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <FieldLabel>{label}</FieldLabel>
            <input
              value={settings[key] ?? ""}
              onChange={(event) => update({ [key]: event.target.value })}
              disabled={!settings.enabled && key !== "seed"}
              className="ui-input w-full px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        className="!min-h-8 px-3 text-xs"
        onClick={() => update(DEFAULT_QUEUE_PARAMS)}
      >
        Reset queue params
      </Button>
    </div>
  );
}
