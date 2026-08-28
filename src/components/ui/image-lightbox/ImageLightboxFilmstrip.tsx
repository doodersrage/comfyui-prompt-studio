'use client';

import type { ImageLightboxState } from '@/components/ui/image-lightbox/types';

type ImageLightboxFilmstripProps = {
  compact?: boolean;
  images: string[];
  index: number;
  state: ImageLightboxState;
  dualMode: boolean;
  dualIndex: number | null;
  onGoToIndex: (nextIndex: number, manual?: boolean) => void;
  onDualIndexChange: (index: number) => void;
};

export default function ImageLightboxFilmstrip({
  compact = false,
  images,
  index,
  state,
  dualMode,
  dualIndex,
  onGoToIndex,
  onDualIndexChange,
}: ImageLightboxFilmstripProps) {
  if (images.length <= 1 || !state.thumbImages?.length) {
    return null;
  }

  return (
    <div className="space-y-1">
      {dualMode ? (
        <p className={`type-caption ${compact ? 'text-white/55' : 'text-[var(--text-muted)]'}`}>
          Pair mode: click a thumb to set the right pane
        </p>
      ) : null}
      <div
        className={`flex max-w-full gap-1.5 overflow-x-auto pb-0.5 ${compact ? 'scrollbar-thin' : ''}`}
      >
        {images.map((_, thumbIndex) => {
          const thumb = state.thumbImages?.[thumbIndex];
          if (!thumb) {
            return null;
          }
          const active = thumbIndex === index;
          const paired = dualMode && dualIndex === thumbIndex;
          return (
            <button
              key={`film-${thumbIndex}`}
              type="button"
              onClick={() => {
                if (dualMode) {
                  if (thumbIndex === index) {
                    return;
                  }
                  onDualIndexChange(thumbIndex);
                  return;
                }
                onGoToIndex(thumbIndex, true);
              }}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                active
                  ? 'border-[var(--accent-border)] ring-1 ring-[var(--accent-ring)]'
                  : paired
                    ? 'border-amber-300/80 ring-1 ring-amber-300/50'
                    : compact
                      ? 'border-white/20 opacity-70 hover:opacity-100'
                      : 'border-[var(--border-subtle)] opacity-80 hover:opacity-100'
              }`}
              aria-label={
                dualMode ? `Set pair image ${thumbIndex + 1}` : `Go to image ${thumbIndex + 1}`
              }
              aria-current={active ? 'true' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
