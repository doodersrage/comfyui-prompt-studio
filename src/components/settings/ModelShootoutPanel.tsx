"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ToolSection } from "@/components/ui/ToolPageShell";
import {
  DEFAULT_SHOOTOUT_MODELS,
  queueSameSeedShootout,
} from "@/lib/model-shootout";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

export default function ModelShootoutPanel() {
  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState("0");
  const [models, setModels] = useState<string[]>(DEFAULT_SHOOTOUT_MODELS.map((entry) => entry.model));
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setSeed(String(Math.floor(Math.random() * 1_000_000)));
    });
  }, []);

  function toggleModel(model: string) {
    setModels((previous) =>
      previous.includes(model) ? previous.filter((entry) => entry !== model) : [...previous, model],
    );
  }

  return (
    <ToolSection title="Same-seed model shootout">
      <p className="mb-3 text-sm text-zinc-400">
        Queue the same prompt and seed across multiple models for a fair comparison.
      </p>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        placeholder="Prompt to compare…"
        className="ui-input mb-3 w-full"
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {DEFAULT_SHOOTOUT_MODELS.map((entry) => (
          <button
            key={entry.model}
            type="button"
            onClick={() => toggleModel(entry.model)}
            data-active={models.includes(entry.model) ? "true" : "false"}
            className="ui-chip"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <label className="mb-3 block space-y-1 text-sm">
        <span className="type-caption text-zinc-500">Seed</span>
        <input
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          className="ui-input w-full max-w-xs"
        />
      </label>
      <Button
        variant="secondary"
        disabled={!prompt.trim() || models.length === 0}
        onClick={() => {
          void queueSameSeedShootout({
            prompt: prompt.trim(),
            models,
            seed: Number(seed) || 0,
          }).then((result) => {
            setStatus(
              result.errors.length > 0
                ? `Queued ${result.queued} · ${result.errors.join(" · ")}`
                : `Queued ${result.queued} model(s). Check Gallery.`,
            );
          });
        }}
      >
        Queue shootout
      </Button>
      {status ? <p className="mt-2 text-sm text-emerald-400">{status}</p> : null}
    </ToolSection>
  );
}
