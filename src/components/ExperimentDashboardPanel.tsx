"use client";

import { useEffect, useState } from "react";
import { ToolSection } from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";
import { loadComfyGallery, type ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import type { ExperimentGroup } from "@/lib/experiment-groups";

export default function ExperimentDashboardPanel() {
  const [groups, setGroups] = useState<ExperimentGroup[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const entries = loadComfyGallery();
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = (await response.json()) as { groups?: ExperimentGroup[] };
      setGroups(data.groups ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <ToolSection title="Experiment dashboard">
      <p className="text-sm text-zinc-400">
        Groups gallery outputs by shared prompt text and tracks seed / CFG / steps variants.
      </p>
      <Button variant="secondary" className="mt-3" loading={loading} onClick={() => void refresh()}>
        Refresh experiments
      </Button>
      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No experiment groups yet. Queue multiple seeds for the same prompt in Gallery.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {groups.map((group) => (
            <li key={group.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <p className="text-sm font-medium text-zinc-100">{group.label}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {group.entries.length} outputs · seeds: {group.variants.seeds.join(", ") || "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ToolSection>
  );
}
