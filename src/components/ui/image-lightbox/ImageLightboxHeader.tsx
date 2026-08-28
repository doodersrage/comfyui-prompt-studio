'use client';

import { Button } from '@/components/ui/Button';

export type ImageLightboxHeaderProps = {
  compact?: boolean;
  overline: string;
  currentTitle?: string;
  displayIndex: number;
  titleAnimating: boolean;
  transitionMs: number;
  onClose: () => void;
};

export default function ImageLightboxHeader({
  compact,
  overline,
  currentTitle,
  displayIndex,
  titleAnimating,
  transitionMs,
  onClose,
}: ImageLightboxHeaderProps) {
  if (compact) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 pb-10 pt-4 sm:px-6">
        <div className="pointer-events-auto flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="type-overline text-white/50">{overline}</p>
            {currentTitle ? (
              <p
                key={`${displayIndex}-${currentTitle}`}
                className={`type-caption line-clamp-2 text-white/80${
                  titleAnimating && transitionMs > 0 ? ' lightbox-title-fade-in' : ''
                }`}
              >
                {currentTitle}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className="!min-h-9 shrink-0 px-3 type-caption !text-white hover:!bg-white/10"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="type-overline text-[var(--text-muted)]">{overline}</p>
        {currentTitle ? (
          <p
            key={`${displayIndex}-${currentTitle}`}
            className={`type-caption line-clamp-2 text-[var(--text-secondary)]${
              titleAnimating && transitionMs > 0 ? ' lightbox-title-fade-in' : ''
            }`}
          >
            {currentTitle}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        className="!min-h-9 shrink-0 px-3 type-caption"
        onClick={onClose}
        aria-label="Close"
      >
        Close
      </Button>
    </div>
  );
}
