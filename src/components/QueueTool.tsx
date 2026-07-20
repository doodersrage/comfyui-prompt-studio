"use client";

import { useEffect, useMemo, useState } from "react";
import { loadComfyGallery, type ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import { galleryEntryViewUrls } from "@/lib/comfyui-gallery";
import { Button } from "@/components/ui/Button";
import { ToolLayout, ToolSection, ToolBadge } from "@/components/ui/ToolPageShell";
import { requeueComfyJob } from "@/lib/comfyui-requeue";

export default function QueueTool() {
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>([]);

  useEffect(() => {
    setEntries(loadComfyGallery());
    const interval = window.setInterval(() => setEntries(loadComfyGallery()), 4000);
    return () => window.clearInterval(interval);
  }, []);

  const pending = useMemo(
    () =>
      entries.filter(
        (entry) => entry.status === "pending" || entry.status === "running",
      ),
    [entries],
  );
  const recent = useMemo(
    () =>
      entries
        .filter((entry) => entry.status === "completed" || entry.status === "error")
        .slice(0, 20),
    [entries],
  );

  return (
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Queue</ToolBadge>}
      title="ComfyUI job queue"
      description="Pending and running jobs across gallery entries. Polls every few seconds."
    >
      <ToolSection title={`Active (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending jobs.</p>
        ) : (
          <ul className="ui-list">
            {pending.map((entry) => (
              <li key={entry.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="truncate text-sm text-zinc-200">{entry.prompt}</p>
                  <p className="type-caption">
                    {entry.status}
                    {entry.queuePosition ? ` · #${entry.queuePosition}` : ""} · {entry.model}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void requeueComfyJob(entry)}>
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ToolSection>

      <ToolSection title="Recent completed">
        <ul className="ui-list">
          {recent.map((entry) => {
            const url = galleryEntryViewUrls(entry)[0];
            return (
              <li key={entry.id} className="ui-list-row items-center gap-3">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
                ) : null}
                <div className="ui-list-primary min-w-0">
                  <p className="truncate text-sm text-zinc-300">{entry.prompt}</p>
                  <p className="type-caption">{entry.status} · {entry.model}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </ToolSection>
    </ToolLayout>
  );
}
