'use client';

import type { ComfyGalleryFilter } from '@/lib/comfyui-gallery';

type GalleryReviewBannerProps = {
  filter: ComfyGalleryFilter;
};

export default function GalleryReviewBanner({ filter }: GalleryReviewBannerProps) {
  return (
    <div
      data-testid="gallery-review-banner"
      className="sticky top-2 z-20 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-3 shadow-[0_12px_40px_-24px_rgba(109,40,217,0.45)] backdrop-blur-md"
      role="status"
    >
      <p className="text-sm font-medium text-violet-50">Review mode</p>
      <p className="mt-1 text-[11px] leading-relaxed text-violet-100/75">
        Click a card to focus it, then rate with{' '}
        <kbd className="rounded bg-violet-950/60 px-1">1–5</kbd>, favorite with{' '}
        <kbd className="rounded bg-violet-950/60 px-1">F</kbd>, navigate with{' '}
        <kbd className="rounded bg-violet-950/60 px-1">N</kbd> /{' '}
        <kbd className="rounded bg-violet-950/60 px-1">P</kbd>
        {filter.reviewAutoAdvance ? ' · auto-advance enabled' : ''}
        {filter.unreviewedOnly ? ' · showing unreviewed only' : ''}
      </p>
    </div>
  );
}
