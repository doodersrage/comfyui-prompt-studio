"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { galleryEntryThumbUrls, initGalleryStore, loadComfyGallery } from "@/lib/comfyui-gallery";
import { loadScheduledBatchConfig } from "@/lib/scheduled-batch";
import { loadActiveProjectId, loadPromptProjects } from "@/lib/prompt-projects";
import { loadLastToolDraft, type ToolDraftSummary } from "@/lib/tool-draft-memory";
import { loadLastToolRoute } from "@/lib/last-tool-route";
import { flattenAppNavLinks } from "@/lib/app-nav-catalog";
import { usePromptHistory } from "@/hooks/usePromptHistory";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { ButtonLink } from "@/components/ui/Button";
import { ToolPageSkeleton } from "@/components/ui/ViewState";
import {
  StatCard,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";

const QueueOrchestrationPanel = dynamic(
  () => import("@/components/QueueOrchestrationPanel"),
  { loading: () => <ToolPageSkeleton label="Loading queue" /> },
);

const ACCENT = "neutral" as const;

function labelForRoute(href: string): string {
  const path = href.split("?")[0] || href;
  const link = flattenAppNavLinks().find(
    (entry) => entry.href === href || (entry.href.split("?")[0] || entry.href) === path,
  );
  return link?.label ?? path;
}

export default function HomeDashboard() {
  const { entries } = usePromptHistory();
  const [gallery, setGallery] = useState<ReturnType<typeof loadComfyGallery>>([]);
  const [scheduled, setScheduled] = useState(loadScheduledBatchConfig());
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [projects, setProjects] = useState(loadPromptProjects());
  const [draft, setDraft] = useState<ToolDraftSummary | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setGallery(loadComfyGallery());
      setScheduled(loadScheduledBatchConfig());
      setActiveProjectId(loadActiveProjectId());
      setProjects(loadPromptProjects());
      setDraft(loadLastToolDraft());
      setLastRoute(loadLastToolRoute());
    };
    void initGalleryStore().then(refresh);
    window.addEventListener("comfyui-gallery-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("comfyui-gallery-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
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
  const showContinue =
    Boolean(draft) ||
    (Boolean(lastRoute) && lastRoute !== "/dashboard" && lastRoute !== draft?.href);

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Overview</ToolBadge>}
      title="Dashboard"
      description="Pending ComfyUI jobs, recent outputs, queue status, and your active project — without the generator UI in the way."
    >
      <OnboardingChecklist />

      {showContinue ? (
        <ToolSection title="Pick up where you left off">
          <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-4 shadow-[var(--shadow-surface)] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              {draft ? (
                <>
                  <p className="type-caption text-[var(--text-muted)]">
                    Draft · {draft.label}
                  </p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {draft.preview}
                  </p>
                </>
              ) : lastRoute ? (
                <>
                  <p className="type-caption text-[var(--text-muted)]">Last tool</p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {labelForRoute(lastRoute)}
                  </p>
                </>
              ) : null}
            </div>
            <ToolActionRow className="shrink-0">
              {draft ? (
                <ButtonLink href={draft.href} variant="primary" size="sm">
                  Resume draft
                </ButtonLink>
              ) : null}
              {lastRoute && lastRoute !== draft?.href ? (
                <ButtonLink href={lastRoute} size="sm">
                  Open {labelForRoute(lastRoute)}
                </ButtonLink>
              ) : null}
            </ToolActionRow>
          </div>
        </ToolSection>
      ) : null}

      <ToolSection>
        <ToolActionRow>
          <ButtonLink href="/" variant="primary" size="sm">
            Generate
          </ButtonLink>
          <ButtonLink href="/gallery" size="sm">
            Gallery
          </ButtonLink>
          <ButtonLink href="/studio" size="sm">
            Studio
          </ButtonLink>
          <ButtonLink href="/queue" size="sm">
            Queue
          </ButtonLink>
          <ButtonLink href="/settings" size="sm">
            Settings
          </ButtonLink>
        </ToolActionRow>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 type-caption text-[var(--text-muted)]">
          <span>More:</span>
          <Link
            href="/topics"
            className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Topics
          </Link>
          <Link
            href="/variations"
            className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Variations
          </Link>
          <Link
            href="/variations?matrix=1"
            className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Matrix
          </Link>
          <Link
            href="/plugins"
            className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Plugins
          </Link>
        </p>

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
              const thumb = galleryEntryThumbUrls(entry)[0];
              return (
                <Link key={entry.id} href="/gallery" className="ui-media-card">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center p-2 type-caption text-[var(--text-muted)]">
                      No preview
                    </div>
                  )}
                  <p className="line-clamp-2 p-2 text-[11px] text-[var(--text-tertiary)]">
                    {entry.prompt}
                  </p>
                </Link>
              );
            })}
          </div>
        </ToolSection>
      ) : null}
    </ToolLayout>
  );
}
