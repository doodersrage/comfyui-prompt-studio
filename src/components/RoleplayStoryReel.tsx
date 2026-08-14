'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spinner } from '@/components/ui/Button';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { downloadRoleplayUrl } from '@/lib/roleplay-export';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import {
  roleplayStillBasename,
  type RoleplayStillStatus,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

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

function beatPreviewUrl(beat: RoleplayStoryBeat, liveUrl: string | null): string | null {
  if (beat.stillStatus === 'completed' && beat.imageUrl?.trim()) {
    return beat.imageUrl.trim();
  }
  return liveUrl?.trim() || null;
}

function RoleplayStillFrame({
  beat,
  liveUrl,
  onOpen,
}: {
  beat: RoleplayStoryBeat;
  liveUrl: string | null;
  onOpen?: () => void;
}) {
  const completedUrl = beat.stillStatus === 'completed' ? beat.imageUrl : undefined;
  const previewUrl = beatPreviewUrl(beat, liveUrl);
  const busy = isBusyStatus(beat.stillStatus) || Boolean(liveUrl && !completedUrl);
  const label = stillLabel(beat, liveUrl);
  const clickable = Boolean(previewUrl && onOpen);

  const frameClass =
    'relative aspect-[4/5] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40';

  const body = (
    <>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={beat.title}
          className={`h-full w-full object-cover ${completedUrl ? '' : 'opacity-80'}`}
        />
      ) : null}

      {busy && !previewUrl ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <Spinner size="lg" />
          <p className="type-caption text-[var(--accent-text)]">{label}</p>
        </div>
      ) : null}

      {busy && previewUrl ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-[var(--bg-base)]/70 px-3 py-2 backdrop-blur-sm">
          <Spinner size="sm" />
          <p className="type-caption text-[var(--accent-text)]">{label}</p>
        </div>
      ) : null}

      {beat.stillStatus === 'error' && !previewUrl ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center">
          <p className="type-caption text-[var(--tint-danger-text)]">{label}</p>
        </div>
      ) : null}

      {!busy && !previewUrl && beat.stillStatus !== 'error' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center">
          <p className="type-caption text-[var(--text-muted)]">{label}</p>
        </div>
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${frameClass} cursor-zoom-in transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
        aria-label={`Open ${beat.title} full size`}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={frameClass} role="status" aria-live="polite" aria-busy={busy || undefined}>
      {body}
    </div>
  );
}

export default function RoleplayStoryReel({
  story,
  busy = false,
  onQueue,
  onCopy,
}: {
  story: RoleplayStoryBeat[];
  busy?: boolean;
  onQueue?: (beat: RoleplayStoryBeat) => void;
  onCopy?: (beat: RoleplayStoryBeat) => void;
}) {
  const promptIds = useMemo(
    () => story.map(beat => beat.promptId).filter((id): id is string => Boolean(id?.trim())),
    [story]
  );
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
      <ol className="grid gap-4 sm:grid-cols-2">
        {story.map((beat, index) => {
          const liveUrl = beat.promptId ? (liveUrls[beat.promptId] ?? null) : null;
          const canQueue = Boolean(beat.prompt && !beat.promptId && onQueue);
          const canCopy = Boolean(beat.prompt && onCopy);
          const canOpen = Boolean(beatPreviewUrl(beat, liveUrl));
          return (
            <li key={`${beat.id}-${beat.at}`}>
              <article className="space-y-2">
                <RoleplayStillFrame
                  beat={beat}
                  liveUrl={liveUrl}
                  onOpen={canOpen ? () => openStill(beat) : undefined}
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    <span className="type-caption mr-2 text-[var(--text-muted)]">{index + 1}.</span>
                    {beat.title}
                  </p>
                  <p className="type-caption text-[var(--text-muted)]">{beat.blurb}</p>
                </div>
                {canQueue || canCopy ? (
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
