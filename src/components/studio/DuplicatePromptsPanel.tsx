"use client";

import { useMemo, useState } from "react";
import { usePromptHistory } from "@/hooks/usePromptHistory";
import { findDuplicatePrompts } from "@/lib/prompt-duplicate-detection";
import { ToolSection } from "@/components/ui/ToolPageShell";

export default function DuplicatePromptsPanel() {
  const { entries } = usePromptHistory();
  const [threshold, setThreshold] = useState(0.85);
  const groups = useMemo(
    () => findDuplicatePrompts(entries.map((entry) => ({ id: entry.id, prompt: entry.prompt })), threshold),
    [entries, threshold],
  );

  return (
    <ToolSection title="Duplicate prompts">
      <p className="mb-3 text-sm text-zinc-400">
        Finds near-identical history entries by token overlap.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
        Similarity threshold
        <input
          type="range"
          min={0.7}
          max={0.95}
          step={0.05}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
        <span>{Math.round(threshold * 100)}%</span>
      </label>
      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">No duplicate clusters found.</p>
      ) : (
        <ul className="space-y-3">
          {groups.slice(0, 12).map((group) => (
            <li key={group.ids.join("-")} className="rounded-xl border border-zinc-800 px-3 py-2 text-sm">
              <p className="text-zinc-500">{group.ids.length} entries · {Math.round(group.similarity * 100)}% similar</p>
              <p className="mt-1 line-clamp-2 text-zinc-300">{group.prompt}</p>
            </li>
          ))}
        </ul>
      )}
    </ToolSection>
  );
}
