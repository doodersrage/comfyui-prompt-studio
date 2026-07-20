"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { galleryEntryViewUrls, initGalleryStore, loadComfyGallery } from "@/lib/comfyui-gallery";
import { loadScheduledBatchConfig } from "@/lib/scheduled-batch";
import { loadActiveProjectId, loadPromptProjects } from "@/lib/prompt-projects";
import { usePromptHistory } from "@/hooks/usePromptHistory";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import QueueOrchestrationPanel from "@/components/QueueOrchestrationPanel";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  StatCard,
  ToolActionRow,
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
    void initGalleryStore().then(refresh);
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
      <OnboardingChecklist />
      <ToolSection title="Power tools">
        <p className="mb-3 text-sm text-zinc-400">
          Prompt recipes, model shootout, observability, and negative learner live under Settings → Automation → Advanced.
        </p>
        <ToolActionRow>
          <ButtonLink href="/gallery" size="sm">
            Gallery & slideshow
          </ButtonLink>
          <ButtonLink href="/queue" size="sm">
            Queue
          </ButtonLink>
          <ButtonLink href="/settings" size="sm">
            Settings & recipes
          </ButtonLink>
          <ButtonLink href="/plugins" size="sm">
            Plugins
          </ButtonLink>
        </ToolActionRow>
      </ToolSection>
      <ToolSection>
        <ToolActionRow>
          <ButtonLink href="/" variant="primary" size="sm">
            Generate prompts
          </ButtonLink>
          <ButtonLink href="/gallery" size="sm">
            Gallery
          </ButtonLink>
          <ButtonLink href="/studio" size="sm">
            Studio
          </ButtonLink>
          <ButtonLink href="/settings" size="sm">
            Settings
          </ButtonLink>
        </ToolActionRow>

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
                <Link key={entry.id} href="/gallery" className="ui-media-card">
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
        <ToolActionRow>
          <Link href="/topics">
            <Button variant="secondary" size="sm">
              Topics batch
            </Button>
          </Link>
          <Link href="/variations?matrix=1">
            <Button variant="secondary" size="sm">
              Prompt matrix
            </Button>
          </Link>
          <Link href="/variations">
            <Button variant="secondary" size="sm">
              Variations
            </Button>
          </Link>
        </ToolActionRow>
      </ToolSection>
    </ToolLayout>
  );
}
