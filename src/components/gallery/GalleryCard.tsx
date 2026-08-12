'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { ComfyUiGalleryJobPlaceholder } from '@/components/ui/ComfyUiJobStatusPanel';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import {
  buildGalleryHandoff,
  buildReeditGalleryHandoff,
  galleryHandoffPath,
  saveGalleryHandoff,
} from '@/lib/gallery-handoff';
import { formatComfyHostLabel } from '@/lib/queue-status-notes';
import {
  formatRenderDuration,
  resolveGalleryRenderDurationMs,
} from '@/lib/comfyui-render-duration';
import {
  startAnatomyRepairFromGalleryEntry,
  startBackgroundFromGalleryEntry,
  startImproveFromGalleryEntry,
  startInpaintFromGalleryEntry,
  startMeshFromGalleryEntry,
  startOutpaintFromGalleryEntry,
} from '@/lib/improve-output';
import {
  buildGalleryVariationsHandoff,
  galleryVariationsPath,
  saveGalleryVariationsHandoff,
} from '@/lib/gallery-variations-handoff';
import { scoreGalleryEntryHeuristic, type AestheticScoreResult } from '@/lib/aesthetic-score';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { updateComfyGalleryEntryById } from '@/lib/comfyui-gallery';
import { downloadGalleryImage, downloadGallerySidecar } from '@/lib/comfyui-gallery-export';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import {
  galleryEntryPrimaryLqipUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbSrcSet,
  galleryEntryMediaKinds,
  type ComfyGalleryEntry,
  type GalleryLayoutMode,
} from '@/lib/comfyui-gallery';
import { galleryDerivedKindLabel } from '@/lib/gallery-derived-kind';

type GalleryCardProps = {
  entry: ComfyGalleryEntry;
  compact: boolean;
  layout?: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  reviewFocus?: boolean;
  cardRef?: React.Ref<HTMLElement>;
  onToggleSelected?: (event?: { shiftKey?: boolean }) => void;
  previewUrl: string | null;
  imageUrls: string[];
  onRemove: () => void;
  onToggleFavorite: () => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean }
  ) => void;
  onCancel: () => void;
  onUpscale: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  onRefine: () => void;
  onSoftSecondPass?: () => void;
  onFaceDetail?: () => void;
  onAnatomyRepair?: () => void;
  onMoireClean?: (qualityProfile: 'final' | 'max', options?: { force?: boolean }) => void;
  /** When false, hide both Final and Max upscale items (unless finer flags set). */
  showUpscaleActions?: boolean;
  showUpscaleFinal?: boolean;
  showUpscaleMax?: boolean;
  showForceUpscaleMax?: boolean;
  showRefineAction?: boolean;
  showSoftSecondPassAction?: boolean;
  showFaceDetailAction?: boolean;
  showAnatomyRepairAction?: boolean;
  showMoireCleanActions?: boolean;
  showMoireCleanFinal?: boolean;
  showMoireCleanMax?: boolean;
  showForceMoireCleanMax?: boolean;
  onShowParent?: () => void;
  onShowDerivatives?: () => void;
  hasDerivatives?: boolean;
  onOpenImage: (index: number) => void;
  /** Warm mid-res lightbox URL before open (hover/focus intent). */
  onPrefetchImage?: (index: number) => void;
  reviewMode?: boolean;
  onReviewRating?: (rating: ComfyGalleryEntry['reviewRating']) => void;
  reviewMutationHints?: string[];
  onVisionTagClick?: (tag: string) => void;
  onViewWorkflow?: () => void;
  onRestoreExactGraph?: () => void;
  /** When set, clicking a pickable card returns the image to the calling tool. */
  pickMode?: boolean;
  pickable?: boolean;
  pickLabel?: string;
  onPick?: () => void;
};

function statusLabel(status: ComfyGalleryEntry['status'], entry?: ComfyGalleryEntry): string {
  if (status === 'completed') return 'Done';
  if (status === 'running') {
    const percent = entry ? comfyUiJobProgressPercent(entry) : null;
    return percent != null ? `Running · ${percent}%` : 'Running';
  }
  if (status === 'pending') return 'Queued';
  return 'Error';
}

function statusTone(status: ComfyGalleryEntry['status']): string {
  if (status === 'completed') {
    return 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]';
  }
  if (status === 'error') {
    return 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
  }
  if (status === 'running') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
  return 'border-[var(--border-default)]/40 bg-[var(--bg-muted)]/60 text-[var(--text-secondary)]';
}

export default function GalleryCard({
  entry,
  compact,
  layout = 'grid',
  selectable,
  selected,
  reviewFocus = false,
  cardRef,
  onToggleSelected,
  previewUrl,
  imageUrls,
  onRemove,
  onToggleFavorite,
  onDownloadError,
  onRequeue,
  onCancel,
  onUpscale,
  onRefine,
  onSoftSecondPass,
  onFaceDetail,
  onAnatomyRepair,
  onMoireClean,
  showUpscaleActions = true,
  showUpscaleFinal,
  showUpscaleMax,
  showForceUpscaleMax = false,
  showRefineAction = true,
  showSoftSecondPassAction = true,
  showFaceDetailAction = false,
  showAnatomyRepairAction = false,
  showMoireCleanActions = true,
  showMoireCleanFinal,
  showMoireCleanMax,
  showForceMoireCleanMax = false,
  onShowParent,
  onShowDerivatives,
  hasDerivatives,
  onOpenImage,
  onPrefetchImage,
  reviewMode,
  onReviewRating,
  reviewMutationHints,
  onVisionTagClick,
  onViewWorkflow,
  onRestoreExactGraph,
  pickMode = false,
  pickable = false,
  pickLabel = 'Use this image',
  onPick,
}: GalleryCardProps) {
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const heroSrcSet = useMemo(() => galleryEntryPrimaryThumbSrcSet(entry), [entry]);
  const lqipUrl = useMemo(() => galleryEntryPrimaryLqipUrl(entry), [entry]);
  const primaryMediaKind = useMemo(() => galleryEntryPrimaryMediaKind(entry), [entry]);
  const stripMediaKinds = useMemo(() => galleryEntryMediaKinds(entry), [entry]);
  const isVideoHero = primaryMediaKind === 'video';
  const isRendering = entry.status === 'pending' || entry.status === 'running';

  useEffect(() => {
    scheduleAfterCommit(() => {
      setHeroLoaded(false);
    });
  }, [previewUrl]);

  const heuristicScore = useMemo(
    () => scoreGalleryEntryHeuristic(entry),
    [entry.id, entry.status, entry.favorite, entry.reviewRating, entry.prompt.length]
  );
  const cachedScore = useMemo((): AestheticScoreResult | null => {
    if (typeof entry.aestheticScore === 'number' && entry.aestheticScoreMethod) {
      return {
        score: entry.aestheticScore,
        method: entry.aestheticScoreMethod,
        notes: ['Cached score'],
      };
    }
    return null;
  }, [entry.aestheticScore, entry.aestheticScoreMethod]);
  const [aestheticScore, setAestheticScore] = useState<AestheticScoreResult>(
    cachedScore ?? heuristicScore
  );
  const [aestheticBusy, setAestheticBusy] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAestheticScore(cachedScore ?? heuristicScore);
    });
  }, [cachedScore, heuristicScore]);

  const scoreWithVision = async () => {
    if (!previewUrl || aestheticBusy || entry.status !== 'completed') {
      return;
    }
    setAestheticBusy(true);
    try {
      const imageResponse = await fetch(previewUrl);
      if (!imageResponse.ok) {
        throw new Error('Could not load preview for vision scoring.');
      }
      const blob = await imageResponse.blob();
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Could not encode preview.'));
        reader.readAsDataURL(blob);
      });
      const response = await fetch('/api/aesthetic/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'vision',
          imageDataUrl,
          prompt: entry.prompt,
          model: entry.model,
          tool: entry.tool,
          status: entry.status,
          favorite: entry.favorite,
          reviewRating: entry.reviewRating,
          images: entry.images,
          comfyUrl: entry.comfyUrl,
          promptId: entry.promptId,
          id: entry.id,
        }),
      });
      const data = (await response.json()) as AestheticScoreResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Aesthetic score failed.');
      }
      const nextScore: AestheticScoreResult = {
        score: data.score,
        method: data.method,
        notes: data.notes ?? [],
      };
      setAestheticScore(nextScore);
      updateComfyGalleryEntryById(entry.id, {
        aestheticScore: nextScore.score,
        aestheticScoreMethod: nextScore.method,
      });
    } catch {
      setAestheticScore(heuristicScore);
    } finally {
      setAestheticBusy(false);
    }
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    const updatePosition = () => {
      const button = menuButtonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const padding = 8;
      const menuWidth = 208;
      const estimatedHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom - padding;
      const spaceAbove = rect.top - padding;
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        160,
        Math.min(estimatedHeight, openUp ? spaceAbove - 4 : spaceBelow - 4)
      );
      const left = Math.min(
        Math.max(padding, rect.right - menuWidth),
        window.innerWidth - menuWidth - padding
      );
      const top = openUp
        ? Math.max(padding, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, window.innerHeight - maxHeight - padding);

      setMenuPosition({ top, left, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuButtonRef.current?.contains(target) || menuPanelRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const derivedLabel = galleryDerivedKindLabel(entry.derivedKind);

  const comfyHostLabel = formatComfyHostLabel(entry.comfyUrl);
  const renderDurationLabel = formatRenderDuration(resolveGalleryRenderDurationMs(entry));
  const metaLine = [
    entry.tool,
    entry.model,
    entry.parentGalleryEntryId ? undefined : derivedLabel,
    comfyHostLabel ? `host ${comfyHostLabel}` : undefined,
    renderDurationLabel ? `render ${renderDurationLabel}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const progressPercent = comfyUiJobProgressPercent(entry);

  const cardTone =
    selected || reviewFocus ? 'ui-selected-frame' : 'border-[var(--border-subtle)]/80';

  const imageBlock = (
    <div
      className={`ui-gallery-frame relative overflow-hidden ${
        layout === 'list'
          ? 'h-28 w-28 shrink-0 rounded-xl sm:h-32 sm:w-36'
          : layout === 'dense'
            ? 'aspect-square rounded-t-xl'
            : 'aspect-[4/5] rounded-t-2xl sm:aspect-square'
      } ${pickMode && !pickable ? 'opacity-45' : ''}`}
    >
      {previewUrl && !isRendering ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (pickMode && pickable && onPick) {
                onPick();
                return;
              }
              onOpenImage(0);
            }}
            onPointerEnter={() => onPrefetchImage?.(0)}
            onFocus={() => onPrefetchImage?.(0)}
            onPointerDown={() => onPrefetchImage?.(0)}
            className={`relative block h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] ${
              pickMode && pickable ? 'cursor-pointer' : 'cursor-zoom-in'
            }`}
            aria-label={pickMode && pickable ? pickLabel : 'Open image preview'}
            disabled={pickMode && !pickable}
          >
            {lqipUrl && !isVideoHero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lqipUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl"
              />
            ) : null}
            {isVideoHero ? (
              <video
                src={previewUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => setHeroLoaded(true)}
                className={`relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02] ${
                  heroLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                srcSet={heroSrcSet ?? undefined}
                alt={entry.prompt.slice(0, 80)}
                loading="lazy"
                decoding="async"
                sizes={
                  layout === 'list'
                    ? '9rem'
                    : layout === 'dense'
                      ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw'
                      : '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw'
                }
                onLoad={() => setHeroLoaded(true)}
                className={`relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02] ${
                  heroLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}
            {isVideoHero ? (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
                Video
              </span>
            ) : null}
          </button>
          {layout !== 'list' && !(pickMode && pickable) ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[var(--bg-base)]/95 via-[var(--bg-base)]/40 to-transparent px-2 pb-2.5 pt-8 opacity-0 transition duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
              <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenImage(0)}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-default)]/80 bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-primary)] backdrop-blur transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
                >
                  Open
                </button>
                {entry.status === 'completed' && !isVideoHero ? (
                  <>
                    <button
                      type="button"
                      onClick={() => startImproveFromGalleryEntry(entry)}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-success-text)] backdrop-blur transition hover:bg-[var(--tint-success-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-success-border)] active:scale-[0.98]"
                    >
                      Improve
                    </button>
                    {layout !== 'dense' ? (
                      <button
                        type="button"
                        onClick={() => startInpaintFromGalleryEntry(entry)}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100 backdrop-blur transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 active:scale-[0.98]"
                      >
                        Inpaint
                      </button>
                    ) : null}
                    {entry.hasStoredWorkflow || entry.workflowJson ? (
                      <button
                        type="button"
                        onClick={() => onRequeue(false, undefined, { exactGraph: true })}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100 backdrop-blur transition hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45 active:scale-[0.98]"
                      >
                        Exact
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRequeue(false)}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
                      >
                        Requeue
                      </button>
                    )}
                    {showFaceDetailAction && onFaceDetail ? (
                      <button
                        type="button"
                        onClick={() => onFaceDetail()}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] backdrop-blur transition hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
                      >
                        Face
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void downloadGalleryImage(entry, 0).catch(error => {
                          onDownloadError(
                            error instanceof Error ? error.message : 'Download failed'
                          );
                        });
                      }}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
                    >
                      ↓
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : isRendering ? (
        <div className="relative flex h-full flex-col">
          <ComfyUiGalleryJobPlaceholder entry={entry} />
          <button
            type="button"
            onClick={onCancel}
            className="absolute bottom-2.5 right-2.5 z-30 rounded-full border border-[var(--tint-danger-border)] bg-[var(--bg-base)]/85 px-2.5 py-1 text-[11px] text-[var(--tint-danger-text)] backdrop-blur transition hover:border-[var(--tint-danger-border)] hover:bg-[var(--tint-danger-bg)] hover:text-[var(--tint-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] active:scale-[0.97]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            {entry.status === 'error'
              ? (entry.statusMessage ?? 'Generation failed')
              : 'No image output'}
          </p>
          {entry.status === 'error' ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {entry.hasStoredWorkflow || entry.workflowJson ? (
                <button
                  type="button"
                  onClick={() => onRequeue(false, undefined, { exactGraph: true })}
                  className="rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-100 transition hover:bg-sky-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45 active:scale-[0.98]"
                >
                  Replay exact
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRequeue(false)}
                className="rounded-lg border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-2.5 py-1 text-[11px] text-[var(--tint-danger-text)] transition hover:bg-[var(--tint-danger-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] active:scale-[0.98]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => onRequeue(true)}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/80 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
              >
                New seed
              </button>
            </div>
          ) : null}
        </div>
      )}

      {layout !== 'list' ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur-sm ${statusTone(entry.status)}`}
            >
              {statusLabel(entry.status, entry)}
            </span>
            {entry.reviewRating ? (
              <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] backdrop-blur-sm">
                {entry.reviewRating}★
              </span>
            ) : null}
            {entry.reviewNote?.trim() ? (
              <span
                className="max-w-[9rem] truncate rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100 backdrop-blur-sm"
                title={entry.reviewNote.trim()}
                data-testid="gallery-card-review-note"
              >
                Note
              </span>
            ) : null}
            {entry.hasStoredWorkflow || entry.workflowJson ? (
              <span
                className="rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 backdrop-blur-sm"
                title="Stored workflow JSON available for exact replay"
              >
                Exact graph
              </span>
            ) : entry.workflowJsonOmitted ? (
              <span
                className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100 backdrop-blur-sm"
                title="Graph was pruned (age/size budget) or too large to store"
              >
                Graph pruned
              </span>
            ) : null}
            {primaryMediaKind === 'video' ? (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 backdrop-blur-sm">
                {entry.sourceImageUrl?.trim() ? 'I2V' : 'Video'}
              </span>
            ) : null}
            {entry.status === 'completed' && !entry.reviewRating ? (
              <button
                type="button"
                disabled={!previewUrl || aestheticBusy}
                onClick={() => void scoreWithVision()}
                className={`pointer-events-auto rounded-full border border-[var(--border-default)]/60 bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-muted)] backdrop-blur-sm transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98] disabled:opacity-50 ${
                  layout === 'dense'
                    ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
                    : ''
                }`}
                title={
                  aestheticScore.notes.join(' · ') ||
                  'Click to score with vision LLM (falls back to heuristic)'
                }
              >
                {aestheticBusy
                  ? '…'
                  : `${aestheticScore.score}${aestheticScore.method === 'vision' ? '★' : ''}`}
              </button>
            ) : null}
          </div>

          <div
            className={`pointer-events-auto flex items-center gap-1 ${
              layout === 'dense' && !entry.favorite
                ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
                : ''
            }`}
          >
            {selectable ? (
              <label
                className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${
                  selected
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                    : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 hover:border-[var(--border-default)]'
                }`}
                onClick={event => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected ?? false}
                  onChange={event => {
                    onToggleSelected?.({
                      shiftKey:
                        'shiftKey' in event.nativeEvent &&
                        Boolean((event.nativeEvent as MouseEvent).shiftKey),
                    });
                  }}
                  aria-label="Select entry"
                  className="h-3.5 w-3.5 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={onToggleFavorite}
              title={entry.favorite ? 'Remove favorite' : 'Add favorite'}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
                entry.favorite
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
                  : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 text-[var(--text-muted)] hover:border-amber-500/40 hover:text-amber-100'
              }`}
            >
              {entry.favorite ? '★' : '☆'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Percent is overlaid inside ComfyUiGalleryJobPlaceholder while rendering. */}
      {(entry.status === 'pending' || entry.status === 'running') &&
      entry.queuePosition != null &&
      entry.queuePosition > 0 &&
      progressPercent == null ? (
        <p className="absolute bottom-2 left-2 z-10 rounded-full border border-[var(--border-default)]/60 bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)] backdrop-blur">
          Queue #{entry.queuePosition}
        </p>
      ) : null}
    </div>
  );

  const bodyBlock = (
    <div
      className={`min-w-0 flex-1 ${
        layout === 'list'
          ? 'space-y-2.5 py-1'
          : layout === 'dense'
            ? 'space-y-1.5 p-2'
            : 'space-y-2.5 p-3.5'
      }`}
    >
      {pickMode && pickable && onPick ? (
        <button
          type="button"
          onClick={onPick}
          className="w-full rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
        >
          {pickLabel}
        </button>
      ) : pickMode && !pickable ? (
        <p className="type-caption text-[var(--text-muted)]">
          Only completed still images can be selected here.
        </p>
      ) : null}
      {layout === 'list' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(entry.status)}`}
          >
            {statusLabel(entry.status, entry)}
          </span>
          {entry.reviewRating ? (
            <span className="text-[10px] text-[var(--accent-text)]">{entry.reviewRating}★</span>
          ) : null}
          {entry.reviewNote?.trim() ? (
            <span
              className="max-w-[12rem] truncate rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100"
              title={entry.reviewNote.trim()}
              data-testid="gallery-card-review-note"
            >
              Note · {entry.reviewNote.trim()}
            </span>
          ) : null}
          {entry.hasStoredWorkflow || entry.workflowJson ? (
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100">
              Exact graph
            </span>
          ) : entry.workflowJsonOmitted ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
              Graph pruned
            </span>
          ) : null}
          {reviewFocus ? (
            <span className="ui-badge" data-tone="accent">
              Review focus
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {promptExpanded ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-muted)]/50 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              {entry.prompt}
            </pre>
          ) : (
            <p
              className={`leading-snug text-[var(--text-secondary)] ${
                layout === 'list'
                  ? 'line-clamp-3 text-sm'
                  : layout === 'dense'
                    ? 'line-clamp-1 text-xs'
                    : 'line-clamp-2 text-sm'
              }`}
            >
              {entry.prompt}
            </p>
          )}
          {metaLine ? (
            <p className="ui-gallery-caption mt-1.5 truncate">
              {entry.parentGalleryEntryId && onShowParent ? (
                <>
                  <button
                    type="button"
                    onClick={onShowParent}
                    className="text-[var(--accent-text)] underline decoration-[var(--accent-border)] underline-offset-2 transition hover:text-[var(--accent-text)]"
                  >
                    {derivedLabel ?? 'View source'}
                  </button>
                  {' · '}
                </>
              ) : null}
              {metaLine}
              {entry.queueParams?.seed != null ? ` · seed ${entry.queueParams.seed}` : ''}
              {entry.queueParams?.videoFrames != null ? ` · ${entry.queueParams.videoFrames}f` : ''}
              {entry.queueParams?.videoFps != null ? ` @ ${entry.queueParams.videoFps}fps` : ''}
              {entry.queuedAt ? ` · ${new Date(entry.queuedAt).toLocaleDateString()}` : ''}
            </p>
          ) : null}
          {entry.visionTags && entry.visionTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.visionTags.slice(0, 8).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onVisionTagClick?.(tag)}
                  className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100 transition hover:border-sky-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {layout === 'list' && selectable ? (
          <label
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur transition ${
              selected
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80'
            }`}
            onClick={event => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={event => {
                onToggleSelected?.({
                  shiftKey:
                    'shiftKey' in event.nativeEvent &&
                    Boolean((event.nativeEvent as MouseEvent).shiftKey),
                });
              }}
              aria-label="Select entry"
              className="h-3.5 w-3.5 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
          </label>
        ) : null}
      </div>

      {!compact && layout !== 'list' && imageUrls.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {imageUrls.slice(1, 5).map((url, thumbIndex) =>
            stripMediaKinds[thumbIndex + 1] === 'video' ? (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                onPointerEnter={() => onPrefetchImage?.(thumbIndex + 1)}
                onFocus={() => onPrefetchImage?.(thumbIndex + 1)}
                onPointerDown={() => onPrefetchImage?.(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] transition hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-label={`Open video ${thumbIndex + 2} preview`}
              >
                <video
                  src={url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-9 w-9 object-cover"
                />
              </button>
            ) : (
              <button
                key={url}
                type="button"
                onClick={() => onOpenImage(thumbIndex + 1)}
                onPointerEnter={() => onPrefetchImage?.(thumbIndex + 1)}
                onFocus={() => onPrefetchImage?.(thumbIndex + 1)}
                onPointerDown={() => onPrefetchImage?.(thumbIndex + 1)}
                className="shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] transition hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-label={`Open image ${thumbIndex + 2} preview`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-9 object-cover"
                />
              </button>
            )
          )}
        </div>
      ) : null}

      {reviewMode && reviewMutationHints && reviewMutationHints.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
          {reviewMutationHints.map(hint => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      ) : null}

      {reviewMode && entry.status === 'completed' && onReviewRating ? (
        <div
          className={`flex flex-wrap items-center gap-1.5 ${
            layout === 'dense'
              ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
              : ''
          }`}
        >
          <span className="text-[11px] text-[var(--text-muted)]">Rate</span>
          {[1, 2, 3, 4, 5].map(rating => (
            <button
              key={rating}
              type="button"
              onClick={() => onReviewRating(rating as ComfyGalleryEntry['reviewRating'])}
              className={`min-h-8 min-w-8 rounded-lg border text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                entry.reviewRating === rating
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {rating}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`flex flex-wrap items-center gap-2 pt-0.5 ${
          layout === 'dense'
            ? 'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'
            : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setPromptExpanded(previous => !previous)}
          className="ui-btn-ghost ui-btn-sm text-xs"
        >
          {promptExpanded ? 'Less' : 'Prompt'}
        </button>
        {layout === 'list' ? (
          <button
            type="button"
            onClick={onToggleFavorite}
            className="ui-btn-ghost ui-btn-sm text-xs"
          >
            {entry.favorite ? 'Unfavorite' : 'Favorite'}
          </button>
        ) : null}

        <div className="relative ml-auto">
          <button
            ref={menuButtonRef}
            type="button"
            data-testid="gallery-card-menu"
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
                setMenuPosition(null);
                return;
              }
              setMenuOpen(true);
            }}
            className="ui-btn-ghost ui-btn-sm text-xs"
          >
            More
          </button>
          {menuOpen && menuPosition ? (
            <ModalPortal>
              <div
                ref={menuPanelRef}
                role="menu"
                className="fixed z-[200] min-w-[12.5rem] overflow-y-auto rounded-xl border border-[var(--border-default)]/80 bg-[var(--bg-base)] p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] ring-1 ring-white/5"
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  maxHeight: menuPosition.maxHeight,
                }}
              >
                <GalleryMenuGroup label="Export">
                  <GalleryMenuButton
                    label="Copy prompt"
                    onClick={() => {
                      void navigator.clipboard.writeText(entry.prompt).catch(() => {
                        onDownloadError('Could not copy prompt.');
                      });
                      setMenuOpen(false);
                    }}
                  />
                  {entry.status === 'completed' && previewUrl ? (
                    <GalleryMenuButton
                      label="Download image"
                      onClick={() => {
                        onDownloadError(null);
                        void downloadGalleryImage(entry).catch(error => {
                          onDownloadError(
                            error instanceof Error ? error.message : 'Download failed.'
                          );
                        });
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}
                  <GalleryMenuButton
                    label="Sidecar JSON"
                    onClick={() => {
                      downloadGallerySidecar(entry);
                      setMenuOpen(false);
                    }}
                  />
                  {onViewWorkflow ? (
                    <GalleryMenuButton
                      label="View workflow"
                      onClick={() => {
                        onViewWorkflow();
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}
                  {entry.historyId ? (
                    <Link
                      href={studioHistoryUrl(entry.historyId)}
                      role="menuitem"
                      className="block rounded-lg px-3 py-2 text-xs text-sky-300 transition hover:bg-[var(--bg-muted)] hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:bg-[var(--bg-muted)]/80"
                      onClick={() => setMenuOpen(false)}
                    >
                      Studio history
                    </Link>
                  ) : null}
                </GalleryMenuGroup>

                {entry.status === 'completed' && entry.prompt?.trim() ? (
                  <GalleryMenuGroup label="Edit">
                    <GalleryMenuButton
                      label="Edit prompt"
                      onClick={() => {
                        saveGalleryHandoff(buildGalleryHandoff(entry, 'promptEditor'));
                        router.push(galleryHandoffPath('promptEditor'));
                        setMenuOpen(false);
                      }}
                    />
                    {previewUrl ? (
                      <>
                        {layout === 'list' ? (
                          <>
                            <GalleryMenuButton
                              label="Improve"
                              onClick={() => {
                                startImproveFromGalleryEntry(entry);
                                setMenuOpen(false);
                              }}
                            />
                            <GalleryMenuButton
                              label="Inpaint"
                              onClick={() => {
                                startInpaintFromGalleryEntry(entry);
                                setMenuOpen(false);
                              }}
                            />
                            {showAnatomyRepairAction ? (
                              <GalleryMenuButton
                                label="Anatomy repair"
                                onClick={() => {
                                  if (onAnatomyRepair) {
                                    onAnatomyRepair();
                                  } else {
                                    startAnatomyRepairFromGalleryEntry(entry);
                                  }
                                  setMenuOpen(false);
                                }}
                              />
                            ) : null}
                            <GalleryMenuButton
                              label="Outpaint"
                              onClick={() => {
                                startOutpaintFromGalleryEntry(entry);
                                setMenuOpen(false);
                              }}
                            />
                          </>
                        ) : null}
                        <GalleryMenuButton
                          label="Refine"
                          onClick={() => {
                            saveGalleryHandoff(buildGalleryHandoff(entry, 'refine'));
                            router.push(galleryHandoffPath('refine'));
                            setMenuOpen(false);
                          }}
                        />
                        {primaryMediaKind === 'image' && previewUrl && showAnatomyRepairAction ? (
                          <GalleryMenuButton
                            label="Anatomy repair → inpaint limb"
                            onClick={() => {
                              if (onAnatomyRepair) {
                                onAnatomyRepair();
                              } else {
                                startAnatomyRepairFromGalleryEntry(entry);
                              }
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        <GalleryMenuButton
                          label="Re-edit · Refine (same stack)"
                          onClick={() => {
                            saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'refine'));
                            router.push(galleryHandoffPath('refine'));
                            setMenuOpen(false);
                          }}
                        />
                        {entry.status === 'completed' ? (
                          <GalleryMenuButton
                            label="Re-edit · Inpaint (same stack)"
                            onClick={() => {
                              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'inpaint'));
                              router.push(galleryHandoffPath('inpaint'));
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        {entry.status === 'completed' ? (
                          <GalleryMenuButton
                            label="Re-edit · Outpaint (same stack)"
                            onClick={() => {
                              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'outpaint'));
                              router.push(galleryHandoffPath('outpaint'));
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        <GalleryMenuButton
                          label="Open in Variations"
                          onClick={() => {
                            saveGalleryVariationsHandoff(buildGalleryVariationsHandoff(entry));
                            router.push(galleryVariationsPath());
                            setMenuOpen(false);
                          }}
                        />
                        <GalleryMenuButton
                          label="Compose"
                          onClick={() => {
                            saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
                            router.push(galleryHandoffPath('compose'));
                            setMenuOpen(false);
                          }}
                        />
                        <GalleryMenuButton
                          label="Re-edit · Compose (same stack)"
                          onClick={() => {
                            saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'compose'));
                            router.push(galleryHandoffPath('compose'));
                            setMenuOpen(false);
                          }}
                        />
                        {layout !== 'list' ? (
                          <GalleryMenuButton
                            label="Outpaint"
                            onClick={() => {
                              startOutpaintFromGalleryEntry(entry);
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        <GalleryMenuButton
                          label="Image → Prompt"
                          onClick={() => {
                            saveGalleryHandoff(buildGalleryHandoff(entry, 'imagePrompt'));
                            router.push(galleryHandoffPath('imagePrompt'));
                            setMenuOpen(false);
                          }}
                        />
                        <GalleryMenuButton
                          label="ControlNet"
                          onClick={() => {
                            saveGalleryHandoff(buildGalleryHandoff(entry, 'controlnet'));
                            router.push(galleryHandoffPath('controlnet'));
                            setMenuOpen(false);
                          }}
                        />
                        {entry.status === 'completed' ? (
                          <GalleryMenuButton
                            label="Re-edit · ControlNet (same stack)"
                            onClick={() => {
                              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'controlnet'));
                              router.push(galleryHandoffPath('controlnet'));
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        <GalleryMenuButton
                          label="Background"
                          onClick={() => {
                            startBackgroundFromGalleryEntry(entry);
                            setMenuOpen(false);
                          }}
                        />
                        {primaryMediaKind === 'image' && entry.status === 'completed' ? (
                          <GalleryMenuButton
                            label="Mesh / 3D"
                            onClick={() => {
                              startMeshFromGalleryEntry(entry);
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        {primaryMediaKind === 'image' && entry.status === 'completed' ? (
                          <GalleryMenuButton
                            label="Send to Video (I2V)"
                            onClick={() => {
                              saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
                              router.push(galleryHandoffPath('video'));
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                        {entry.status === 'completed' ? (
                          <GalleryMenuButton
                            label="Re-edit · Video (same stack)"
                            onClick={() => {
                              saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'video'));
                              router.push(galleryHandoffPath('video'));
                              setMenuOpen(false);
                            }}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </GalleryMenuGroup>
                ) : null}

                <GalleryMenuGroup label="Queue">
                  {entry.status === 'pending' || entry.status === 'running' ? (
                    <GalleryMenuButton
                      label="Cancel job"
                      tone="danger"
                      onClick={() => {
                        onCancel();
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}
                  {entry.hasStoredWorkflow || entry.workflowJson ? (
                    <GalleryMenuButton
                      label="Replay exact graph"
                      data-testid="gallery-replay-exact"
                      onClick={() => {
                        onRequeue(false, undefined, { exactGraph: true });
                        setMenuOpen(false);
                      }}
                    />
                  ) : entry.promptId?.trim() && onRestoreExactGraph ? (
                    <GalleryMenuButton
                      label="Restore exact graph from Comfy history"
                      data-testid="gallery-restore-exact"
                      onClick={() => {
                        onRestoreExactGraph();
                        setMenuOpen(false);
                      }}
                    />
                  ) : null}
                  <GalleryMenuButton
                    label="Re-queue (same seed)"
                    onClick={() => {
                      onRequeue(false, undefined, { exactGraph: false });
                      setMenuOpen(false);
                    }}
                  />
                  <GalleryMenuButton
                    label="New seed"
                    onClick={() => {
                      onRequeue(true, undefined, { exactGraph: false });
                      setMenuOpen(false);
                    }}
                  />
                  <GalleryMenuButton
                    label="Variation · Final (hires sampler)"
                    onClick={() => {
                      onRequeue(true, 'final', { exactGraph: false });
                      setMenuOpen(false);
                    }}
                  />
                  <GalleryMenuButton
                    label="Variation · Max (heavy polish)"
                    onClick={() => {
                      onRequeue(true, 'max', { exactGraph: false });
                      setMenuOpen(false);
                    }}
                  />
                </GalleryMenuGroup>

                {(() => {
                  // Simplified conditions for better readability
                  const canUpscaleFinal = showUpscaleFinal ?? showUpscaleActions;
                  const canUpscaleMax = showUpscaleMax ?? showUpscaleActions;
                  const canMoireFinal = showMoireCleanFinal ?? showMoireCleanActions;
                  const canMoireMax = showMoireCleanMax ?? showMoireCleanActions;

                  // Direct checks for each action to reduce redundant conditions
                  const shouldShowUpscaleFinal = canUpscaleFinal;
                  const shouldShowUpscaleMax = canUpscaleMax;
                  const shouldShowForceUpscaleMax = showForceUpscaleMax;
                  const shouldShowSoftSecondPass = onSoftSecondPass && showSoftSecondPassAction;
                  const shouldShowRefine = showRefineAction;
                  const shouldShowFaceDetail = onFaceDetail && showFaceDetailAction;
                  const shouldShowMoireFinal = onMoireClean && canMoireFinal;
                  const shouldShowMoireMax = onMoireClean && canMoireMax;
                  const shouldShowForceMoireCleanMax = onMoireClean && showForceMoireCleanMax;

                  // Check if any enhance actions are available
                  const hasEnhanceActions =
                    shouldShowUpscaleFinal ||
                    shouldShowUpscaleMax ||
                    shouldShowForceUpscaleMax ||
                    shouldShowSoftSecondPass ||
                    shouldShowRefine ||
                    shouldShowFaceDetail ||
                    shouldShowMoireFinal ||
                    shouldShowMoireMax ||
                    shouldShowForceMoireCleanMax;

                  if (!hasEnhanceActions) {
                    return null;
                  }

                  return (
                    <GalleryMenuGroup label="Enhance">
                      {shouldShowUpscaleFinal && (
                        <GalleryMenuButton
                          label="Upscale → Final (~1.25× Lanczos)"
                          onClick={() => {
                            onUpscale('final');
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowUpscaleMax && (
                        <GalleryMenuButton
                          label="Upscale → Max (full pipeline)"
                          onClick={() => {
                            onUpscale('max');
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowForceUpscaleMax && (
                        <GalleryMenuButton
                          label="Force Upscale · Max"
                          onClick={() => {
                            onUpscale('max', { force: true });
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowRefine && (
                        <GalleryMenuButton
                          label="Refine → low-denoise second pass"
                          onClick={() => {
                            onRefine();
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowSoftSecondPass && (
                        <GalleryMenuButton
                          label="Soft second pass → gentler denoise"
                          onClick={() => {
                            onSoftSecondPass();
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowFaceDetail && (
                        <GalleryMenuButton
                          label="Face detail → second KSampler pass"
                          onClick={() => {
                            onFaceDetail();
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowMoireFinal && (
                        <GalleryMenuButton
                          label="Flux polish → Final (blur only)"
                          onClick={() => {
                            onMoireClean('final');
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowMoireMax && (
                        <GalleryMenuButton
                          label="Flux polish → Max (blur + resample)"
                          onClick={() => {
                            onMoireClean('max');
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      {shouldShowForceMoireCleanMax && (
                        <GalleryMenuButton
                          label="Force Flux polish → Max"
                          onClick={() => {
                            onMoireClean('max', { force: true });
                            setMenuOpen(false);
                          }}
                        />
                      )}
                    </GalleryMenuGroup>
                  );
                })()}

                {hasDerivatives && onShowDerivatives ? (
                  <GalleryMenuGroup label="Lineage">
                    <GalleryMenuButton
                      label="Show derivatives"
                      onClick={() => {
                        onShowDerivatives();
                        setMenuOpen(false);
                      }}
                    />
                  </GalleryMenuGroup>
                ) : null}

                <GalleryMenuGroup label="Manage">
                  <GalleryMenuButton
                    label="Remove from gallery"
                    tone="danger"
                    onClick={() => {
                      onRemove();
                      setMenuOpen(false);
                    }}
                  />
                </GalleryMenuGroup>
              </div>
            </ModalPortal>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <article
      ref={cardRef}
      data-gallery-entry={entry.id}
      data-review-focus={reviewFocus ? 'true' : undefined}
      className={`group/card ui-gallery-card ui-media-reveal relative min-w-0 transition hover:border-[var(--border-default)]/80 ${
        layout === 'dense' ? 'rounded-xl' : 'rounded-2xl'
      } ${
        menuOpen
          ? 'z-30'
          : layout === 'dense'
            ? 'z-0 [content-visibility:auto] [contain-intrinsic-size:auto_220px]'
            : 'z-0 [content-visibility:auto] [contain-intrinsic-size:auto_320px]'
      } ${cardTone}`}
    >
      {layout === 'list' ? (
        <div className="flex gap-4 p-3">
          {imageBlock}
          {bodyBlock}
        </div>
      ) : (
        <>
          {imageBlock}
          {bodyBlock}
        </>
      )}
    </article>
  );
}

function GalleryMenuGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  const groupTone =
    label === 'Export'
      ? 'border-sky-700/50 bg-sky-900/35 text-sky-400' // cool accent
      : label === 'Edit'
        ? 'border-amber-600/45 bg-amber-800/30 text-amber-400' // creative
        : label === 'Queue'
          ? 'border-slate-700/50 bg-slate-900/35 text-slate-400' // grounded
          : label === 'Enhance'
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]' // premium
            : label === 'Lineage'
              ? 'border-cyan-700/50 bg-cyan-900/35 text-cyan-400' // ancestry
              : label === 'Manage'
                ? 'border-[var(--border-default)]/45 bg-[var(--bg-muted)]/25 text-[var(--text-muted)]' // utility
                : 'border-[var(--border-default)]/60 bg-[var(--bg-muted)]/30 text-[var(--text-muted)]'; // default

  return (
    <div className="border-t border-[var(--border-subtle)]/80 py-1 first:border-t-0 first:pt-0">
      {label ? (
        <p
          className={
            `rounded-full px-3 pb-1 pt-1.5 text-[10px] font-bold tracking-wider ${groupTone} ` +
            'backdrop-blur-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]'
          }
        >
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function GalleryMenuButton(props: {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props['data-testid']}
      onClick={props.onClick}
      className={`block w-full rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-base)]/70 px-3.5 py-2 text-left text-xs backdrop-blur-xs transition ${
        props.tone === 'danger'
          ? 'text-[var(--tint-danger-text)] hover:bg-[var(--tint-danger-bg)] hover:text-[var(--tint-danger-text)] hover:border-[var(--tint-danger-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]'
      } active:scale-[0.98]`}
    >
      {props.label}
    </button>
  );
}
