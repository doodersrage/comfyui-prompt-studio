'use client';

import { type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxSlideshowOptions } from '@/components/ui/image-lightbox/types';

type ImageLightboxSideNavProps = {
  imagesLength: number;
  index: number;
  isFullscreen: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  slideshow?: ImageLightboxSlideshowOptions;
  onGoToIndex: (nextIndex: number, manual?: boolean) => void;
  onStopStagePointer: (event: ReactPointerEvent<HTMLElement>) => void;
};

export default function ImageLightboxSideNav({
  imagesLength,
  index,
  isFullscreen,
  canGoPrevious,
  canGoNext,
  slideshow,
  onGoToIndex,
  onStopStagePointer,
}: ImageLightboxSideNavProps) {
  if (imagesLength <= 1) {
    return null;
  }

  if (isFullscreen) {
    return (
      <>
        <button
          type="button"
          className="absolute inset-y-0 left-0 z-30 w-[18%] cursor-w-resize bg-gradient-to-r from-black/35 via-black/10 to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
          onPointerDown={onStopStagePointer}
          onClick={() => {
            const prevIndex = index > 0 ? index - 1 : slideshow?.playing ? imagesLength - 1 : 0;
            onGoToIndex(prevIndex, !slideshow?.playing);
          }}
          aria-label="Previous image"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 z-30 w-[18%] cursor-e-resize bg-gradient-to-l from-black/35 via-black/10 to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
          onPointerDown={onStopStagePointer}
          onClick={() => {
            const nextIndex =
              index < imagesLength - 1 ? index + 1 : slideshow?.playing ? 0 : imagesLength - 1;
            onGoToIndex(nextIndex, !slideshow?.playing);
          }}
          aria-label="Next image"
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        className="absolute left-3 top-1/2 z-30 !min-h-10 -translate-y-1/2 border border-white/30 !bg-[var(--bg-base)]/85 px-3.5 type-caption !text-white shadow-[0_8px_28px_rgb(0_0_0/0.55)] backdrop-blur-md hover:!bg-[var(--bg-muted)]/95 hover:!text-white focus-visible:ring-2 focus-visible:ring-white/40 disabled:!bg-[var(--bg-base)]/40 disabled:!text-white/35"
        disabled={!canGoPrevious}
        onPointerDown={onStopStagePointer}
        onClick={() => onGoToIndex(index - 1, true)}
        aria-label="Previous image"
      >
        ← Prev
      </Button>
      <Button
        variant="secondary"
        className="absolute right-3 top-1/2 z-30 !min-h-10 -translate-y-1/2 border border-white/30 !bg-[var(--bg-base)]/85 px-3.5 type-caption !text-white shadow-[0_8px_28px_rgb(0_0_0/0.55)] backdrop-blur-md hover:!bg-[var(--bg-muted)]/95 hover:!text-white focus-visible:ring-2 focus-visible:ring-white/40 disabled:!bg-[var(--bg-base)]/40 disabled:!text-white/35"
        disabled={!canGoNext}
        onPointerDown={onStopStagePointer}
        onClick={() => onGoToIndex(index + 1, true)}
        aria-label="Next image"
      >
        Next →
      </Button>
    </>
  );
}
