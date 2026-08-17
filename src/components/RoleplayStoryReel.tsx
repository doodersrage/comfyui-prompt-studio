'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Button, Spinner } from '@/components/ui/Button';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import UiIcon from '@/components/ui/UiIcon';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import { canFalExtendFromParentUrl } from '@/lib/video-clip-mode';
import { looksLikeMotionUrl } from '@/lib/roleplay-film';
import { loadEngineSettings } from '@/lib/engine-settings';
import { downloadRoleplayUrl } from '@/lib/roleplay-export';
import MotionMedia from '@/components/ui/MotionMedia';
import { isHtmlVideoViewUrl, stripGalleryViewWidthParam } from '@/lib/comfyui-outputs';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import {
  canRetryRoleplayClip,
  canRetryRoleplayStill,
  lastCompletedRoleplayStillUrl,
  roleplayClipTakes,
  roleplayClipTakeIndex,
  roleplayStillBasename,
  roleplayStillTakes,
  roleplayStillTakeIndex,
  roleplayStoryPromptIds,
  type RoleplayStillStatus,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

function clipLabel(beat: RoleplayStoryBeat): string | null {
  if (beat.clipStatus === 'completed' && beat.clipUrl?.trim()) {
    return null;
  }
  if (beat.clipStatus === 'error') {
    return 'Clip failed';
  }
  if (beat.clipStatus === 'running') {
    return 'Animating…';
  }
  if (beat.clipStatus === 'queued') {
    return 'Clip queued…';
  }
  if (beat.clipStatus === 'writing') {
    return 'Writing motion…';
  }
  return null;
}

function stillLabel(beat: RoleplayStoryBeat, liveUrl: string | null): string {
  if (beat.stillStatus === 'completed' && beat.imageUrl) {
    return beat.title;
  }
  if (beat.stillStatus === 'error') {
    return 'Still failed';
  }
  if (beat.stillStatus === 'running') {
    return 'Rendering…';
  }
  if (beat.stillStatus === 'queued') {
    return liveUrl ? 'Queued · preview' : 'Queued…';
  }
  if (beat.prompt && beat.stillStatus === 'writing') {
    return 'Queueing…';
  }
  if (beat.stillStatus === 'writing') {
    return 'Writing still…';
  }
  if (beat.prompt && !beat.promptId) {
    return 'Prompt ready';
  }
  return 'Waiting for a still';
}

function isBusyStatus(status: RoleplayStillStatus | undefined): boolean {
  return status === 'writing' || status === 'queued' || status === 'running';
}

function beatMotionUrl(beat: RoleplayStoryBeat): string | null {
  if (beat.clipStatus !== 'completed') {
    return null;
  }
  const clipUrl = beat.clipUrl?.trim();
  if (!clipUrl) {
    return null;
  }
  return stripGalleryViewWidthParam(clipUrl);
}

function beatPreviewUrl(beat: RoleplayStoryBeat, liveUrl: string | null): string | null {
  const motion = beatMotionUrl(beat);
  if (motion) {
    return motion;
  }
  if (beat.stillStatus === 'completed' && beat.imageUrl?.trim()) {
    return beat.imageUrl.trim();
  }
  return liveUrl?.trim() || null;
}

function beatDisplayUrl(beat: RoleplayStoryBeat, liveUrl: string | null): string | null {
  return beatPreviewUrl(beat, liveUrl) || lastCompletedRoleplayStillUrl(beat);
}

const overlayBtnClass =
  'flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-[var(--bg-base)]/80 text-[var(--text-primary)] shadow-sm backdrop-blur-sm transition hover:bg-[var(--bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-40';

function RoleplayStillFrame({
  beat,
  liveUrl,
  onOpen,
  onRetry,
  onRetryClip,
  onSelectTake,
  onSelectClipTake,
}: {
  beat: RoleplayStoryBeat;
  liveUrl: string | null;
  onOpen?: () => void;
  onRetry?: () => void;
  onRetryClip?: () => void;
  onSelectTake?: (index: number) => void;
  onSelectClipTake?: (index: number) => void;
}) {
  const takes = roleplayStillTakes(beat);
  const takeIndex = roleplayStillTakeIndex(beat);
  const clipTakes = roleplayClipTakes(beat);
  const clipTakeIndex = roleplayClipTakeIndex(beat);
  const completedUrl = beat.stillStatus === 'completed' ? beat.imageUrl : undefined;
  const clipUrl = beatMotionUrl(beat) ?? '';
  const motionClip = Boolean(clipUrl && looksLikeMotionUrl(clipUrl));
  const playHtmlVideo = Boolean(clipUrl && isHtmlVideoViewUrl(clipUrl));
  const openableUrl = beatPreviewUrl(beat, liveUrl);
  const displayUrl = beatDisplayUrl(beat, liveUrl);
  const frameUrl = displayUrl;
  const ghost = Boolean(displayUrl && !openableUrl);
  const clipBusy = isBusyStatus(beat.clipStatus);
  const busy = isBusyStatus(beat.stillStatus) || clipBusy || Boolean(liveUrl && !completedUrl);
  const motionLabel = clipLabel(beat);
  const label = motionLabel || stillLabel(beat, liveUrl);
  const clickable = Boolean(openableUrl && onOpen);
  const canRetry = Boolean(!motionClip && onRetry && canRetryRoleplayStill(beat));
  const canRetryClip = Boolean(onRetryClip && canRetryRoleplayClip(beat));
  const canPageClips = Boolean(motionClip && onSelectClipTake && clipTakes.length > 1);
  const canPageStills = Boolean(!motionClip && onSelectTake && takes.length > 1);
  const pageIndex = canPageClips ? clipTakeIndex : takeIndex;
  const pageCount = canPageClips ? clipTakes.length : takes.length;
  const canPage = canPageClips || canPageStills;

  const frameClass =
    'relative aspect-[4/5] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40';

  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className={frameClass} role="status" aria-live="polite" aria-busy={busy || undefined}>
      {motionClip && clipUrl ? (
        <MotionMedia
          src={clipUrl}
          alt={beat.title}
          className="h-full w-full object-cover"
          autoPlay
          loop
          muted
          controls={playHtmlVideo}
          poster={completedUrl ?? displayUrl ?? undefined}
        />
      ) : frameUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frameUrl}
          alt={beat.title}
          className={`h-full w-full object-cover ${completedUrl && !ghost ? '' : 'opacity-80'}`}
        />
      ) : null}

      {clickable && !playHtmlVideo ? (
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
          aria-label={`Open ${beat.title} full size`}
        />
      ) : null}

      {busy && !displayUrl ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <Spinner size="lg" />
          <p className="type-caption text-[var(--accent-text)]">{label}</p>
        </div>
      ) : null}

      {busy && displayUrl ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-[var(--bg-base)]/70 px-3 py-2 backdrop-blur-sm">
          <Spinner size="sm" />
          <p className="type-caption text-[var(--accent-text)]">{label}</p>
        </div>
      ) : null}

      {beat.stillStatus === 'error' && !displayUrl ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="type-caption text-[var(--tint-danger-text)]">{label}</p>
        </div>
      ) : null}

      {!busy && !displayUrl && beat.stillStatus !== 'error' ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <p className="type-caption text-[var(--text-muted)]">{label}</p>
        </div>
      ) : null}

      {canPage ? (
        <>
          <button
            type="button"
            className={`${overlayBtnClass} absolute left-1.5 top-1/2 z-20 -translate-y-1/2`}
            aria-label={canPageClips ? 'Previous clip version' : 'Previous still version'}
            disabled={pageIndex <= 0}
            onClick={event => {
              stop(event);
              if (canPageClips) {
                onSelectClipTake?.(pageIndex - 1);
              } else {
                onSelectTake?.(pageIndex - 1);
              }
            }}
          >
            <UiIcon name="chevronLeft" size={14} />
          </button>
          <button
            type="button"
            className={`${overlayBtnClass} absolute right-1.5 top-1/2 z-20 -translate-y-1/2`}
            aria-label={canPageClips ? 'Next clip version' : 'Next still version'}
            disabled={pageIndex >= pageCount - 1}
            onClick={event => {
              stop(event);
              if (canPageClips) {
                onSelectClipTake?.(pageIndex + 1);
              } else {
                onSelectTake?.(pageIndex + 1);
              }
            }}
          >
            <UiIcon name="chevronRight" size={14} />
          </button>
          <p className="pointer-events-none absolute left-1.5 top-1.5 z-20 rounded-full bg-[var(--bg-base)]/75 px-2 py-0.5 type-caption text-[var(--text-secondary)] backdrop-blur-sm">
            {pageIndex + 1} / {pageCount}
          </p>
        </>
      ) : null}

      {canRetry ? (
        <button
          type="button"
          className={`${overlayBtnClass} absolute right-1.5 top-1.5 z-20`}
          aria-label="Play another still with a new seed"
          title="Play another still"
          onClick={event => {
            stop(event);
            onRetry?.();
          }}
        >
          <UiIcon name="retry" size={14} />
        </button>
      ) : null}

      {motionClip && canRetryClip ? (
        <button
          type="button"
          className={`${overlayBtnClass} absolute right-1.5 top-1.5 z-20`}
          aria-label="Play another clip with a new seed"
          title="Play another clip"
          onClick={event => {
            stop(event);
            onRetryClip?.();
          }}
        >
          <UiIcon name="retry" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export default function RoleplayStoryReel({
  story,
  busy = false,
  onQueue,
  onCopy,
  onRetry,
  onRetryClip,
  onAnimate,
  onExtend,
  onSelectTake,
  onSelectClipTake,
}: {
  story: RoleplayStoryBeat[];
  busy?: boolean;
  onQueue?: (beat: RoleplayStoryBeat) => void;
  onCopy?: (beat: RoleplayStoryBeat) => void;
  onRetry?: (beat: RoleplayStoryBeat) => void;
  onRetryClip?: (beat: RoleplayStoryBeat) => void;
  onAnimate?: (beat: RoleplayStoryBeat) => void;
  onExtend?: (beat: RoleplayStoryBeat) => void;
  onSelectTake?: (beat: RoleplayStoryBeat, index: number) => void;
  onSelectClipTake?: (beat: RoleplayStoryBeat, index: number) => void;
}) {
  const promptIds = useMemo(() => roleplayStoryPromptIds(story), [story]);
  const promptKey = promptIds.join('|');
  const [liveUrls, setLiveUrls] = useState<Record<string, string | null>>({});
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);

  useEffect(() => {
    const refresh = () => {
      const next: Record<string, string | null> = {};
      for (const id of promptKey.split('|').filter(Boolean)) {
        next[id] = getComfyLivePreviewUrl(id);
      }
      setLiveUrls(next);
    };
    refresh();
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
  }, [promptKey]);

  const watchPlaylist = useMemo(() => roleplayWatchPlaylist(story), [story]);

  const playlist = useMemo(() => {
    return story.flatMap(beat => {
      const liveUrl = beat.promptId ? (liveUrls[beat.promptId] ?? null) : null;
      const url = beatPreviewUrl(beat, liveUrl);
      if (!url) {
        return [];
      }
      return [
        {
          url,
          title: beat.title,
          prompt: beat.prompt,
          kind: looksLikeMotionUrl(url) ? ('video' as const) : ('image' as const),
        },
      ];
    });
  }, [liveUrls, story]);

  const openStill = useCallback(
    (beat: RoleplayStoryBeat) => {
      const liveUrl = beat.promptId ? (liveUrls[beat.promptId] ?? null) : null;
      const url = beatPreviewUrl(beat, liveUrl);
      if (!url) {
        return;
      }
      const index = playlist.findIndex(slide => slide.url === url && slide.title === beat.title);
      setLightbox({
        images: playlist.map(slide => slide.url),
        titles: playlist.map(slide => slide.title),
        originalImages: playlist.map(slide => slide.url),
        mediaKinds: playlist.map(slide => slide.kind),
        index: index >= 0 ? index : 0,
        title: beat.title,
      });
    },
    [liveUrls, playlist]
  );

  if (story.length === 0) {
    return (
      <p className="type-caption text-[var(--text-muted)]">
        No beats yet. The plot is a blank page.
      </p>
    );
  }

  const activeSlide = lightbox ? playlist[lightbox.index] : undefined;

  return (
    <>
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: playlist[index]?.title ?? previous.title,
                }
              : previous
          )
        }
        onDownloadImage={async index => {
          const slide = playlist[index];
          if (!slide?.url) {
            return;
          }
          const storyIndex = story.findIndex(
            entry => entry.title === slide.title && entry.prompt === slide.prompt
          );
          try {
            await downloadRoleplayUrl(
              slide.url,
              `${roleplayStillBasename(slide.title, storyIndex >= 0 ? storyIndex : index)}.png`
            );
          } catch {
            // Lightbox download is best-effort; the zip export is the full bundle.
          }
        }}
        slideChrome={
          activeSlide?.prompt
            ? {
                meta: { tool: 'roleplay', prompt: activeSlide.prompt },
                onCopyPrompt: onCopy
                  ? () => {
                      const beat = story.find(
                        entry =>
                          entry.title === activeSlide.title && entry.prompt === activeSlide.prompt
                      );
                      if (beat) {
                        onCopy(beat);
                      }
                    }
                  : undefined,
              }
            : null
        }
      />
      {watchPlaylist.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">
            Watch plays completed clips in beat order. Stills hold when a clip is not ready.
          </p>
          <FilmWatchPlayer shots={watchPlaylist} />
        </div>
      ) : null}
      <ol className="grid gap-4 sm:grid-cols-2">
        {story.map((beat, index) => {
          const clipLive =
            beat.clipPromptId && (beat.clipStatus === 'queued' || beat.clipStatus === 'running')
              ? (liveUrls[beat.clipPromptId] ?? null)
              : null;
          const liveUrl = clipLive ?? (beat.promptId ? (liveUrls[beat.promptId] ?? null) : null);
          const takes = roleplayStillTakes(beat);
          const clipTakes = roleplayClipTakes(beat);
          const hasClipAttempt = clipTakes.some(
            take =>
              take.clipPromptId ||
              take.clipUrl ||
              take.clipStatus === 'completed' ||
              take.clipStatus === 'error' ||
              isBusyStatus(take.clipStatus)
          );
          const canQueue = Boolean(
            beat.prompt &&
            onQueue &&
            !beat.promptId &&
            !takes.some(
              take =>
                take.promptId ||
                take.imageUrl ||
                take.stillStatus === 'completed' ||
                take.stillStatus === 'error' ||
                isBusyStatus(take.stillStatus)
            )
          );
          const canCopy = Boolean(beat.prompt && onCopy);
          const canOpen = Boolean(beatPreviewUrl(beat, liveUrl));
          const clipBusy =
            beat.clipStatus === 'writing' ||
            beat.clipStatus === 'queued' ||
            beat.clipStatus === 'running';
          const canAnimateStill = Boolean(
            onAnimate &&
            beatDisplayUrl(beat, liveUrl) &&
            beat.stillStatus === 'completed' &&
            !hasClipAttempt &&
            !clipBusy
          );
          const canAnimateT2v = Boolean(
            onAnimate && beat.prompt?.trim() && !canAnimateStill && !hasClipAttempt && !clipBusy
          );
          const canAnimate = canAnimateStill || canAnimateT2v;
          const canExtend = Boolean(
            onExtend && beat.clipStatus === 'completed' && beat.clipUrl?.trim()
          );
          const canRetryClipAction = Boolean(
            onRetryClip && canRetryRoleplayClip(beat) && !beatMotionUrl(beat)
          );
          return (
            <li key={`${beat.id}-${beat.at}`}>
              <article className="space-y-2">
                <RoleplayStillFrame
                  beat={beat}
                  liveUrl={liveUrl}
                  onOpen={canOpen ? () => openStill(beat) : undefined}
                  onRetry={onRetry ? () => onRetry(beat) : undefined}
                  onRetryClip={onRetryClip ? () => onRetryClip(beat) : undefined}
                  onSelectTake={
                    onSelectTake ? nextIndex => onSelectTake(beat, nextIndex) : undefined
                  }
                  onSelectClipTake={
                    onSelectClipTake ? nextIndex => onSelectClipTake(beat, nextIndex) : undefined
                  }
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    <span className="type-caption mr-2 text-[var(--text-muted)]">{index + 1}.</span>
                    {beat.title}
                  </p>
                  <p className="type-caption text-[var(--text-muted)]">{beat.blurb}</p>
                </div>
                {canQueue || canCopy || canAnimate || canExtend || canRetryClipAction ? (
                  <div className="flex flex-wrap gap-2">
                    {canQueue ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onQueue?.(beat)}
                      >
                        Queue still
                      </Button>
                    ) : null}
                    {canAnimate ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onAnimate?.(beat)}
                      >
                        {canAnimateStill ? 'Animate still' : 'Text to video'}
                      </Button>
                    ) : null}
                    {canRetryClipAction ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onRetryClip?.(beat)}
                      >
                        Play another clip
                      </Button>
                    ) : null}
                    {canExtend ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onExtend?.(beat)}
                      >
                        {canFalExtendFromParentUrl(beat.clipUrl) &&
                        loadEngineSettings().engine === 'fal'
                          ? 'Extend clip'
                          : 'Continue from last frame'}
                      </Button>
                    ) : null}
                    {canCopy ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onCopy?.(beat)}
                      >
                        Copy prompt
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </>
  );
}
