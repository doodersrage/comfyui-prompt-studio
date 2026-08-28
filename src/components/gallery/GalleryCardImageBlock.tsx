'use client';

import { useRouter } from 'next/navigation';
import { ComfyUiGalleryJobPlaceholder } from '@/components/ui/ComfyUiJobStatusPanel';
import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import { startImproveFromGalleryEntry, startInpaintFromGalleryEntry } from '@/lib/improve-output';
import type { AestheticScoreResult } from '@/lib/aesthetic-score';
import { downloadGalleryImage } from '@/lib/comfyui-gallery-export';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery-stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery-identity-lock';
import { galleryToolHref } from '@/lib/gallery-tool-href';
import { CustomGroupBadge, statusLabel, statusTone } from '@/components/gallery/galleryCardStatus';

export type GalleryCardImageBlockProps = {
  entry: ComfyGalleryEntry;
  layout: GalleryLayoutMode;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: (event?: { shiftKey?: boolean }) => void;
  previewUrl: string | null;
  onToggleFavorite: () => void;
  onDownloadError: (message: string | null) => void;
  onRequeue: (
    newSeed: boolean,
    qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
    options?: { exactGraph?: boolean; stickyHost?: boolean }
  ) => void;
  onCancel: () => void;
  onFaceDetail?: () => void;
  showFaceDetailAction?: boolean;
  onOpenImage: (index: number) => void;
  onPrefetchImage?: (index: number) => void;
  onCustomGroupClick?: (group: string) => void;
  pickMode?: boolean;
  pickable?: boolean;
  pickLabel?: string;
  onPick?: () => void;
  leanHoverActions?: boolean;
  isRendering: boolean;
  playbackIndex: number;
  primaryMediaKind: ReturnType<typeof import('@/lib/comfyui-gallery').galleryEntryPrimaryMediaKind>;
  lqipUrl: string | null;
  showHtmlVideo: boolean;
  isVideoHero: boolean;
  heroSrcSet: string | null;
  heroLoaded: boolean;
  setHeroLoaded: (loaded: boolean) => void;
  setHeroVideoFailed: (failed: boolean) => void;
  comfyHostLabel: string | null;
  progressPercent: number | null;
  aestheticScore: AestheticScoreResult;
  aestheticBusy: boolean;
  scoreWithVision: () => void;
};

export default function GalleryCardImageBlock({
  entry,
  layout,
  selectable,
  selected,
  onToggleSelected,
  previewUrl,
  onToggleFavorite,
  onDownloadError,
  onRequeue,
  onCancel,
  onFaceDetail,
  showFaceDetailAction = false,
  onOpenImage,
  onPrefetchImage,
  onCustomGroupClick,
  pickMode = false,
  pickable = false,
  pickLabel = 'Use this image',
  onPick,
  leanHoverActions = false,
  isRendering,
  playbackIndex,
  primaryMediaKind,
  lqipUrl,
  showHtmlVideo,
  isVideoHero,
  heroSrcSet,
  heroLoaded,
  setHeroLoaded,
  setHeroVideoFailed,
  comfyHostLabel,
  progressPercent,
  aestheticScore,
  aestheticBusy,
  scoreWithVision,
}: GalleryCardImageBlockProps) {
  const router = useRouter();

  return (
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
              onOpenImage(playbackIndex);
            }}
            onPointerEnter={() => onPrefetchImage?.(playbackIndex)}
            onFocus={() => onPrefetchImage?.(playbackIndex)}
            onPointerDown={() => onPrefetchImage?.(playbackIndex)}
            className={`relative block h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] ${
              pickMode && pickable ? 'cursor-pointer' : 'cursor-zoom-in'
            }`}
            aria-label={
              pickMode && pickable
                ? pickLabel
                : primaryMediaKind === 'audio'
                  ? 'Open audio preview'
                  : primaryMediaKind === 'mesh'
                    ? 'Open 3D file'
                    : primaryMediaKind === 'video'
                      ? 'Open clip preview'
                      : 'Open image preview'
            }
            disabled={pickMode && !pickable}
          >
            {lqipUrl && primaryMediaKind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lqipUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-80 blur-xl"
              />
            ) : null}
            {showHtmlVideo ? (
              <video
                src={previewUrl!}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                poster={lqipUrl ?? undefined}
                onLoadedData={() => setHeroLoaded(true)}
                onError={() => setHeroVideoFailed(true)}
                className="relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02]"
              />
            ) : primaryMediaKind === 'audio' || primaryMediaKind === 'mesh' ? (
              <GalleryKindPreview
                kind={primaryMediaKind}
                src={previewUrl}
                filename={entry.images[playbackIndex]?.filename}
                className="relative h-full w-full"
                alt={entry.prompt.slice(0, 80)}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                srcSet={isVideoHero ? undefined : (heroSrcSet ?? undefined)}
                alt={entry.prompt.slice(0, 80)}
                loading="lazy"
                decoding="async"
                sizes={
                  isVideoHero
                    ? undefined
                    : layout === 'list'
                      ? '9rem'
                      : layout === 'dense'
                        ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw'
                        : '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw'
                }
                onLoad={() => setHeroLoaded(true)}
                className={`relative h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02] ${
                  isVideoHero || heroLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}
            {isVideoHero ? (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
                Video
              </span>
            ) : primaryMediaKind === 'audio' ? (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
                Audio
              </span>
            ) : primaryMediaKind === 'mesh' ? (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/85 backdrop-blur-sm">
                3D
              </span>
            ) : null}
          </button>
          {layout !== 'list' && !(pickMode && pickable) ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[var(--bg-base)]/95 via-[var(--bg-base)]/40 to-transparent px-2 pb-2.5 pt-8 opacity-0 transition duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
              <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenImage(playbackIndex)}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-default)]/80 bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-primary)] backdrop-blur transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Open
                </button>
                {entry.status === 'completed' && !isVideoHero ? (
                  <>
                    {leanHoverActions ? null : (
                      <>
                        <button
                          type="button"
                          onClick={() => startImproveFromGalleryEntry(entry)}
                          className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-success-text)] backdrop-blur transition hover:bg-[var(--tint-success-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-success-border)]"
                        >
                          Improve
                        </button>
                        {layout !== 'dense' ? (
                          <button
                            type="button"
                            onClick={() => startInpaintFromGalleryEntry(entry)}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-warning-text)] backdrop-blur transition hover:bg-[var(--tint-warning-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                          >
                            Inpaint
                          </button>
                        ) : null}
                        {entry.hasStoredWorkflow || entry.workflowJson ? (
                          <button
                            type="button"
                            onClick={() => onRequeue(false, undefined, { exactGraph: true })}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-info-text)] backdrop-blur transition hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                          >
                            Exact
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRequeue(false)}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                          >
                            Requeue
                          </button>
                        )}
                      </>
                    )}
                    {galleryEntryHasRestorableStack(entry) ? (
                      <button
                        type="button"
                        data-testid="gallery-use-stack"
                        onClick={() => {
                          applyGalleryStackToSession(entry);
                          router.push(galleryToolHref(entry.tool));
                        }}
                        className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                          (entry.reviewRating ?? 0) >= 4
                            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] hover:bg-[var(--accent-soft)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/70 text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        Stack
                      </button>
                    ) : null}
                    {leanHoverActions ? null : galleryEntryHasRestorableStack(entry) &&
                      entry.prompt?.trim() ? (
                      <button
                        type="button"
                        data-testid="gallery-use-prompt-stack"
                        onClick={() => {
                          applyGalleryPromptAndStackToSession(entry);
                          router.push(galleryToolHref(entry.tool));
                        }}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      >
                        Prompt+
                      </button>
                    ) : null}
                    {galleryEntryCanLockFace(entry) ? (
                      <button
                        type="button"
                        data-testid="gallery-lock-face"
                        onClick={() => {
                          void applyGalleryFaceToSession(entry).then(result => {
                            if (result.ok) {
                              router.push(galleryToolHref(entry.tool));
                            }
                          });
                        }}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      >
                        Lock
                      </button>
                    ) : null}
                    {leanHoverActions ? null : (
                      <>
                        {galleryEntryCanSaveLook(entry) ? (
                          <button
                            type="button"
                            data-testid="gallery-save-look"
                            onClick={() => {
                              saveGalleryLookFromEntry(entry);
                            }}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                          >
                            Look
                          </button>
                        ) : null}
                        {showFaceDetailAction && onFaceDetail ? (
                          <button
                            type="button"
                            onClick={() => onFaceDetail()}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] backdrop-blur transition hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                          >
                            Face
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            void downloadGalleryImage(entry, playbackIndex).catch(error => {
                              onDownloadError(
                                error instanceof Error ? error.message : 'Download failed'
                              );
                            });
                          }}
                          className="shrink-0 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] backdrop-blur transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                        >
                          ↓
                        </button>
                      </>
                    )}
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
            className="absolute bottom-2.5 right-2.5 z-30 rounded-full border border-[var(--tint-danger-border)] bg-[var(--bg-base)]/85 px-2.5 py-1 text-[11px] text-[var(--tint-danger-text)] backdrop-blur transition hover:border-[var(--tint-danger-border)] hover:bg-[var(--tint-danger-bg)] hover:text-[var(--tint-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
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
                  className="rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2.5 py-1 text-[11px] text-[var(--tint-info-text)] transition hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Replay exact
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRequeue(false)}
                className="rounded-lg border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-2.5 py-1 text-[11px] text-[var(--tint-danger-text)] transition hover:bg-[var(--tint-danger-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)]"
              >
                Retry
              </button>
              {entry.comfyUrl?.trim() ? (
                <button
                  type="button"
                  onClick={() =>
                    onRequeue(false, undefined, {
                      exactGraph: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
                      stickyHost: true,
                    })
                  }
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/80 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Retry on {comfyHostLabel ?? 'this host'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRequeue(true)}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/80 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
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
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone(entry.status)}`}
            >
              {statusLabel(entry.status, entry)}
            </span>
            {entry.reviewRating ? (
              <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)]">
                {entry.reviewRating}★
              </span>
            ) : null}
            {entry.customGroup?.trim() ? (
              <CustomGroupBadge
                name={entry.customGroup.trim()}
                onClick={onCustomGroupClick}
                pointerEvents
              />
            ) : null}
            <span className="contents opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
              {entry.reviewNote?.trim() ? (
                <span
                  className="max-w-[9rem] truncate rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-warning-text)]"
                  title={entry.reviewNote.trim()}
                  data-testid="gallery-card-review-note"
                >
                  Note
                </span>
              ) : null}
              {entry.hasStoredWorkflow || entry.workflowJson ? (
                <span
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                  title="Stored workflow JSON available for exact replay"
                >
                  Exact graph
                </span>
              ) : entry.workflowJsonOmitted ? (
                <span
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                  title="Graph was pruned (age/size budget) or too large to store"
                >
                  Graph pruned
                </span>
              ) : null}
              {primaryMediaKind === 'video' ? (
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {entry.sourceImageUrl?.trim() ? 'I2V' : 'Video'}
                </span>
              ) : null}
              {entry.status === 'completed' && !entry.reviewRating ? (
                <button
                  type="button"
                  disabled={!previewUrl || aestheticBusy}
                  onClick={() => void scoreWithVision()}
                  className="pointer-events-auto rounded-full border border-[var(--border-default)]/60 bg-[var(--bg-base)]/70 px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
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
            </span>
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
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                entry.favorite
                  ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)] hover:bg-[var(--tint-warning-bg)]'
                  : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 text-[var(--text-muted)] hover:border-[var(--tint-warning-border)] hover:text-[var(--tint-warning-text)]'
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
}
