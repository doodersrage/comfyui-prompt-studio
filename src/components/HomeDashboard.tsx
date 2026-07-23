"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { galleryEntryThumbUrls, initGalleryStore, loadComfyGallery } from "@/lib/comfyui-gallery";
import { loadScheduledBatchConfig } from "@/lib/scheduled-batch";
import { loadActiveProjectId, loadPromptProjects } from "@/lib/prompt-projects";
import { loadLastToolDraft, clearLastToolDraft, type ToolDraftSummary } from "@/lib/tool-draft-memory";
import { loadLastToolRoute, clearLastToolRoute } from "@/lib/last-tool-route";
import { flattenAppNavLinks } from "@/lib/app-nav-catalog";
import {
  buildGalleryFocusUrl,
  buildUseAsHintsUrlFromGallery,
} from "@/lib/use-as-hints-url";
import { startPromptEditorFromGalleryEntry } from "@/lib/improve-output";
import { usePromptHistory } from "@/hooks/usePromptHistory";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import ConnectionHealthChip from "@/components/ConnectionHealthChip";
import { Button, ButtonLink } from "@/components/ui/Button";
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ConnectionHealthChip />
      </div>
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearLastToolDraft();
                  clearLastToolRoute();
                  setDraft(null);
                  setLastRoute(null);
                }}
              >
                Dismiss
              </Button>
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
        <ToolSection
          title="Recent outputs"
          description="Open a result, continue editing, or seed a new scene from its prompt."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentCompleted.map((entry) => {
              const thumb = galleryEntryThumbUrls(entry)[0];
              const focusHref = buildGalleryFocusUrl(entry.id);
              const hintsHref = buildUseAsHintsUrlFromGallery(entry);
              return (
                <div
                  key={entry.id}
                  className="group ui-media-card relative overflow-hidden transition hover:border-[var(--border-strong)] focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)]"
                >
                  <Link href={focusHref} className="block">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center p-2 type-caption text-[var(--text-muted)]">
                        No preview
                      </div>
                    )}
                    <p className="line-clamp-2 p-2 text-[11px] text-[var(--text-tertiary)]">
                      {entry.prompt}
                    </p>
                  </Link>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1 gap-1 bg-gradient-to-t from-[rgb(0_0_0_/0.72)] via-[rgb(0_0_0_/0.45)] to-transparent p-2 pt-8 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <button
                      type="button"
                      className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onClick={() => startPromptEditorFromGalleryEntry(entry)}
                    >
                      Edit
                    </button>
                    <Link
                      href={hintsHref}
                      className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      Hints
                    </Link>
                    <Link
                      href={focusHref}
                      className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <ButtonLink href="/gallery" size="sm">
              Open gallery
            </ButtonLink>
          </div>
        </ToolSection>
      ) : null}
    </ToolLayout>
  );
}
