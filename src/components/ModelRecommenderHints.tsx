"use client";

import { useEffect, useMemo, useState } from "react";
import { recommendModels, type ModelRecommendation } from "@/lib/model-recommender";
import type { ComfyImageModel } from "@/lib/comfy-models/client";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";

type ModelRecommenderHintsProps = {
  text: string;
  currentModel: ComfyImageModel;
  onApplyModel?: (model: ComfyImageModel) => void;
};

const RECOMMEND_DEBOUNCE_MS = 400;

export default function ModelRecommenderHints({
  text,
  currentModel,
  onApplyModel,
}: ModelRecommenderHintsProps) {
  const [debouncedText, setDebouncedText] = useState(text);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(text), RECOMMEND_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const suggestions = useMemo((): ModelRecommendation[] => {
    const trimmed = debouncedText.trim();
    if (trimmed.length < 8) {
      return [];
    }
    return recommendModels(trimmed, 3);
  }, [debouncedText]);

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
