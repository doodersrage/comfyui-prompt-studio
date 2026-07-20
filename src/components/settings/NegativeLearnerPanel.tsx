"use client";

import { useCallback, useEffect, useState } from "react";
import { ToolSection } from "@/components/ui/ToolPageShell";
import {
  activeNegativeSuggestions,
  dismissNegativeSuggestion,
  loadNegativeSuggestions,
  type NegativeSuggestion,
} from "@/lib/negative-learner";

export default function NegativeLearnerPanel() {
  const [items, setItems] = useState<NegativeSuggestion[]>([]);

  const refresh = useCallback(() => {
    setItems(activeNegativeSuggestions(20));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ToolSection title="Negative prompt learner">
      <p className="mb-3 text-sm text-zinc-400">
        Tokens from gallery prompts rated 1–2 stars. Add frequent ones to your negative list.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No suggestions yet — rate a few low outputs in Gallery review.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.token}>
              <button
                type="button"
                onClick={() => {
                  dismissNegativeSuggestion(item.token);
                  refresh();
                }}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-100 transition hover:border-rose-400/50"
                title="Dismiss suggestion"
              >
                {item.token} · {item.count}×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-3 text-xs text-zinc-500 underline underline-offset-2"
        onClick={() => {
          setItems(loadNegativeSuggestions().filter((entry) => !entry.dismissed));
        }}
      >
        Show all learned tokens
      </button>
    </ToolSection>
  );
}
