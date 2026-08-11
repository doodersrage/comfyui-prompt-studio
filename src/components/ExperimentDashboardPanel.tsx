'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import {
  buildGalleryLightboxPlaylist,
  galleryEntryThumbUrls,
  loadComfyGallery,
  resolveGalleryLightboxOpenIndex,
  COMFYUI_GALLERY_UPDATED_EVENT,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { downloadGalleryImage } from '@/lib/comfyui-gallery-export';
import type { ExperimentGroup } from '@/lib/experiment-groups';
import {
  EXPERIMENT_WINNERS_UPDATED_EVENT,
  clearExperimentWinner,
  loadExperimentWinners,
  markExperimentWinner,
} from '@/lib/experiment-winners';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import { downloadCompareExport } from '@/lib/gallery-compare-export';
import { requeueComfyJobs } from '@/lib/comfyui-requeue';
import { resolveRequeueImageUrlsFromEntry } from '@/lib/queue-requeue-images';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { EmptyState } from '@/components/ui/ViewState';
import VirtualizedExperimentList, {
  shouldVirtualizeExperimentList,
} from '@/components/studio/VirtualizedExperimentList';
import { crownBestVisionEntryForGroup } from '@/lib/best-of-n-vision-queue';

export default function ExperimentDashboardPanel() {
  const [groups, setGroups] = useState<ExperimentGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [winners, setWinners] = useState(loadExperimentWinners);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [visionRankingGroupId, setVisionRankingGroupId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [lightboxEntries, setLightboxEntries] = useState<ComfyGalleryEntry[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const entries = loadComfyGallery();
      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const data = (await response.json()) as { groups?: ExperimentGroup[] };
      setGroups(data.groups ?? []);
      setWinners(loadExperimentWinners());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refresh();
    });
    const handler = () => void refresh();
    const onWinners = () => setWinners(loadExperimentWinners());
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
    window.addEventListener(EXPERIMENT_WINNERS_UPDATED_EVENT, onWinners);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
      window.removeEventListener(EXPERIMENT_WINNERS_UPDATED_EVENT, onWinners);
    };
  }, []);

  const expandedGroup = useMemo(
    () => groups.find(group => group.id === expandedGroupId) ?? null,
    [expandedGroupId, groups]
  );
  const useVirtual = shouldVirtualizeExperimentList(groups.length);

  function openPreview(group: ExperimentGroup, entryId: string) {
    const playlist = buildGalleryLightboxPlaylist(group.entries);
    if (playlist.images.length === 0) {
      return;
    }
    const index = resolveGalleryLightboxOpenIndex(group.entries, entryId, 0);
    setLightboxEntries(group.entries);
    setLightbox({
      ...playlist,
      index,
      title: playlist.titles[index],
    });
  }

  function renderGroup(group: ExperimentGroup) {
    const winner = winners[group.id];
    const winnerEntry = winner
      ? group.entries.find(entry => entry.id === winner.entryId)
      : undefined;
    const expanded = expandedGroupId === group.id && expandedGroup?.id === group.id;
    return (
      <article
        key={group.id}
        className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)]/80 bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-5 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm font-medium text-[var(--text-primary)]">{group.label}</p>
            <p className="type-caption text-[var(--text-muted)]">
              {group.entries.length} outputs · seeds: {group.variants.seeds.join(', ') || '—'}
              {group.variants.cfgValues.length
                ? ` · CFG: ${group.variants.cfgValues.join(', ')}`
                : ''}
            </p>
            {winnerEntry ? (
              <p className="type-caption text-emerald-300/90">
                Winner: seed {winnerEntry.queueParams?.seed ?? '—'}
                {winnerEntry.reviewRating ? ` · rated ${winnerEntry.reviewRating}/5` : ''}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpandedGroupId(previous => (previous === group.id ? null : group.id))
              }
            >
              {expanded ? 'Hide actions' : 'Expand'}
            </Button>
            <Link
              href={`/gallery?q=${encodeURIComponent(group.parentPrompt.slice(0, 120))}`}
              className="ui-btn-secondary ui-btn-sm"
            >
              Open in gallery
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {group.entries.slice(0, 4).map(entry => {
            const thumb = galleryEntryThumbUrls(entry)[0];
            const isWinner = winner?.entryId === entry.id;
            return (
              <div
                key={entry.id}
                className={`overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--bg-base)]/50 ${
                  isWinner
                    ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]'
                    : 'border-[var(--border-subtle)]/80'
                }`}
              >
                {thumb ? (
                  <button
                    type="button"
                    onClick={() => openPreview(group, entry.id)}
                    className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-label="Open preview"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover transition hover:opacity-95"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs text-[var(--text-muted)]">
                    No preview
                  </div>
                )}
                <div className="space-y-2 p-2.5">
                  <p className="type-caption text-[var(--text-muted)]">
                    seed {entry.queueParams?.seed ?? '—'}
                    {entry.reviewRating ? ` · ${entry.reviewRating}/5` : ''}
                  </p>
                  <Button
                    type="button"
                    variant={isWinner ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (isWinner) {
                        clearExperimentWinner(group.id);
                      } else {
                        markExperimentWinner(group.id, entry.id);
                      }
                      setWinners(loadExperimentWinners());
                    }}
                  >
                    {isWinner ? 'Winner ✓' : 'Crown winner'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {expanded ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border-subtle)]/70 pt-4">
            <Button
              variant="secondary"
              size="sm"
              loading={visionRankingGroupId === group.id}
              disabled={group.entries.length < 2}
              onClick={() => {
                setVisionRankingGroupId(group.id);
                setStatus('Vision-ranking experiment group…');
                void crownBestVisionEntryForGroup(group.id, group.entries)
                  .then(winner => {
                    if (winner) {
                      setWinners(loadExperimentWinners());
                      setStatus(`Crowned vision winner (seed ${winner.queueParams?.seed ?? '—'}).`);
                    } else {
                      setStatus(
                        'Vision rank failed — check LLM_VISION_MODEL and completed outputs.'
                      );
                    }
                  })
                  .finally(() => setVisionRankingGroupId(null));
              }}
            >
              Rank with vision
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={group.entries.length < 2}
              onClick={() => downloadCompareExport(group.entries.slice(0, 4), 'html')}
            >
              Export compare HTML
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={group.entries.length < 2}
              onClick={() => downloadCompareExport(group.entries.slice(0, 4), 'json')}
            >
              Export compare JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStatus('Re-queueing experiment group…');
                void requeueComfyJobs(
                  group.entries.map(entry => {
                    const urls = resolveRequeueImageUrlsFromEntry(entry);
                    return {
                      prompt: entry.prompt,
                      negativePrompt: entry.negativePrompt,
                      model: entry.model,
                      tool: entry.tool,
                      queueParams: entry.queueParams,
                      sourceImageUrl: urls.sourceImageUrl,
                      maskImageUrl: urls.maskImageUrl,
                      newSeed: true,
                    };
                  }),
                  message => setStatus(message)
                ).then(({ queued, failed }) => {
                  setStatus(`Re-queued ${queued} job(s) with new seeds.`);
                  toastBulkQueueSummary({
                    label: 'Experiment re-queue finished',
                    queued,
                    failed,
                  });
                });
              }}
            >
              Re-queue with new seeds
            </Button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <ToolSection
      title="Experiment dashboard"
      description="Groups gallery outputs by shared prompt text and tracks seed / CFG / steps variants. Crown a winner, compare outputs, or re-queue the group."
    >
      <ImageLightbox
        state={lightbox}
        onClose={() => {
          setLightbox(null);
          setLightboxEntries([]);
        }}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? { ...previous, index, title: previous.titles?.[index] ?? previous.title }
              : previous
          )
        }
        onDownloadImage={async displayIndex => {
          const { resolveGalleryLightboxEntry } = await import('@/lib/comfyui-gallery');
          const resolved = resolveGalleryLightboxEntry(lightboxEntries, displayIndex);
          if (!resolved) {
            return;
          }
          await downloadGalleryImage(resolved.entry, resolved.imageIndex);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={loading} onClick={() => void refresh()}>
          Refresh experiments
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          compact
          className="mt-4"
          icon="compare"
          title="No experiment groups yet"
          description="Queue multiple seeds or CFG/steps variants for the same prompt in Gallery — they'll group here automatically."
          action={{ label: 'Open Gallery', href: '/gallery' }}
        />
      ) : useVirtual ? (
        <VirtualizedExperimentList
          groups={groups}
          renderGroup={renderGroup}
          measureKey={expandedGroupId}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-[var(--block-gap)]">
          {groups.map(group => renderGroup(group))}
        </div>
      )}

      {status ? <p className="mt-4 text-sm text-emerald-400">{status}</p> : null}
    </ToolSection>
  );
}
