"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { galleryEntryViewUrls, loadComfyGallery } from "@/lib/comfyui-gallery";
import { loadScheduledBatchConfig } from "@/lib/scheduled-batch";
import { loadActiveProjectId, loadPromptProjects } from "@/lib/prompt-projects";
import { usePromptHistory } from "@/hooks/usePromptHistory";
import QueueOrchestrationPanel from "@/components/QueueOrchestrationPanel";
import { Button } from "@/components/ui/Button";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";

const ACCENT = "neutral" as const;

export default function HomeDashboard() {
  const { entries } = usePromptHistory();
  const [gallery, setGallery] = useState(() => loadComfyGallery());
  const [scheduled, setScheduled] = useState(loadScheduledBatchConfig());
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [projects, setProjects] = useState(loadPromptProjects());

  useEffect(() => {
    const refresh = () => {
      setGallery(loadComfyGallery());
      setScheduled(loadScheduledBatchConfig());
      setActiveProjectId(loadActiveProjectId());
      setProjects(loadPromptProjects());
    };
    refresh();
    window.addEventListener("comfyui-gallery-updated", refresh);
    return () => window.removeEventListener("comfyui-gallery-updated", refresh);
  }, []);

  const pending = useMemo(
    () => gallery.filter((entry) => entry.status === "pending" || entry.status === "running"),
    [gallery],
  );
  const recentCompleted = useMemo(
    () =>
      gallery
        .filter((entry) => entry.status === "completed")
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 6),
    [gallery],
  );
  const activeProject = projects.find((project) => project.id === activeProjectId);

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Overview</ToolBadge>}
      title="Dashboard"
      description="Pending ComfyUI jobs, recent outputs, queue status, and your active project — without the generator UI in the way."
    >
      <ToolSection>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="ui-btn-primary !min-h-9 px-4 text-sm">
            Generate prompts
          </Link>
          <Link href="/gallery" className="ui-btn-secondary !min-h-9 px-4 text-sm">
            Gallery
          </Link>
          <Link href="/studio" className="ui-btn-secondary !min-h-9 px-4 text-sm">
            Studio
          </Link>
          <Link href="/settings" className="ui-btn-secondary !min-h-9 px-4 text-sm">
            Settings
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pending ComfyUI" value={String(pending.length)} />
          <StatCard label="History entries" value={String(entries.length)} />
          <StatCard
            label="Scheduled batch"
            value={scheduled.enabled ? `Every ${scheduled.intervalMinutes}m` : "Off"}
          />
          <StatCard label="Active project" value={activeProject?.name ?? "None"} />
        </div>
      </ToolSection>

      <QueueOrchestrationPanel compact />

      {recentCompleted.length > 0 ? (
        <ToolSection title="Recent outputs">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentCompleted.map((entry) => {
              const thumb = galleryEntryViewUrls(entry)[0];
              return (
                <Link
                  key={entry.id}
                  href="/gallery"
                  className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40 transition hover:border-zinc-600 hover:shadow-[0_12px_32px_-20px_rgba(0,0,0,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center p-2 text-xs text-zinc-500">
                      No preview
                    </div>
                  )}
                  <p className="line-clamp-2 p-2 text-[11px] text-zinc-400">{entry.prompt}</p>
                </Link>
              );
            })}
          </div>
        </ToolSection>
      ) : null}

      <ToolSection title="Quick launch">
        <div className="flex flex-wrap gap-2">
          <Link href="/topics">
            <Button variant="secondary" className="!min-h-9">
              Topics batch
            </Button>
          </Link>
          <Link href="/variations?matrix=1">
            <Button variant="secondary" className="!min-h-9">
              Prompt matrix
            </Button>
          </Link>
          <Link href="/variations">
            <Button variant="secondary" className="!min-h-9">
              Variations
            </Button>
          </Link>
        </div>
      </ToolSection>
    </ToolLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
