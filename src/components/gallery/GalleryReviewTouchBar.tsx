'use client';

type GalleryReviewTouchBarProps = {
  onRate: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onFavorite: () => void;
  onNext: () => void;
  onPrev: () => void;
};

export default function GalleryReviewTouchBar({
  onRate,
  onFavorite,
  onNext,
  onPrev,
}: GalleryReviewTouchBarProps) {
  const ratingColors = [
    'border-rose-600/55 bg-rose-900/20 text-rose-400 hover:bg-rose-500/40 hover:border-rose-500/80',
    'border-orange-600/50 bg-orange-900/18 text-orange-400 hover:bg-orange-500/35 hover:border-orange-500/75',
    'border-sky-600/45 bg-sky-900/15 text-sky-400 hover:bg-sky-500/30 hover:border-sky-500/70',
    'border-emerald-600/50 bg-emerald-900/18 text-emerald-400 hover:bg-emerald-500/35 hover:border-emerald-500/75',
    'border-violet-600/55 bg-violet-900/20 text-violet-400 hover:bg-violet-500/40 hover:border-violet-500/80',
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 px-3 py-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          className={`ui-btn-secondary min-h-11 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/60 backdrop-blur-xs transition hover:bg-violet-500/25 hover:border-violet-500/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 text-violet-400`}
        >
          Prev
        </button>
        <div className="flex gap-1">
          {([1, 2, 3, 4, 5] as const).map((rating, idx) => (
            <button
              key={rating}
              type="button"
              onClick={() => onRate(rating)}
              className={`min-h-11 min-w-11 rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-base)]/70 backdrop-blur-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 ${ratingColors[idx]}`}
            >
              {rating}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFavorite}
          className={`ui-btn-secondary min-h-11 rounded-xl border border-amber-600/55 bg-amber-900/20 backdrop-blur-xs transition hover:bg-amber-500/40 hover:border-amber-500/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 text-amber-400`}
        >
          ★
        </button>
        <button
          type="button"
          onClick={onNext}
          className={`ui-btn-secondary min-h-11 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/60 backdrop-blur-xs transition hover:bg-violet-500/25 hover:border-violet-500/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 text-violet-400`}
        >
          Next
        </button>
      </div>
    </div>
  );
}
