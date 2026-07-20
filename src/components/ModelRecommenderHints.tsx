"use client";

import { useEffect, useMemo, useState } from "react";
import { recommendModels, type ModelRecommendation } from "@/lib/model-recommender";
import type { ComfyImageModel } from "@/lib/comfy-models";
import { getComfyModelDefinition } from "@/lib/comfy-models";

type ModelRecommenderHintsProps = {
  text: string;
  currentModel: ComfyImageModel;
  onApplyModel?: (model: ComfyImageModel) => void;
};

export default function ModelRecommenderHints({
  text,
  currentModel,
  onApplyModel,
}: ModelRecommenderHintsProps) {
  const [remote, setRemote] = useState<ModelRecommendation[] | null>(null);

  const local = useMemo(() => recommendModels(text, 3), [text]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 8) {
      setRemote(null);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/models/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, limit: 3 }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { recommendations?: ModelRecommendation[] } | null) => {
        setRemote(data?.recommendations ?? null);
      })
      .catch(() => setRemote(null));
    return () => controller.abort();
  }, [text]);

  const suggestions = remote ?? local;
  if (!text.trim() || suggestions.length === 0 || !onApplyModel) {
    return null;
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <p className="type-caption text-violet-200/80">Suggested models</p>
      <ul className="mt-2 space-y-1.5">
        {suggestions.map((item) => {
          const def = getComfyModelDefinition(item.model as ComfyImageModel);
          const active = item.model === currentModel;
          return (
            <li key={item.model} className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                disabled={active}
                onClick={() => onApplyModel(item.model as ComfyImageModel)}
                className="rounded-full border border-violet-500/30 bg-zinc-950/40 px-2.5 py-0.5 text-violet-100 transition hover:border-violet-400/50 disabled:cursor-default disabled:opacity-60"
              >
                {def.label}
                {active ? " · current" : ""}
              </button>
              <span className="text-zinc-500">{item.reason}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
