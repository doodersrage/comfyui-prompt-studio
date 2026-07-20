"use client";

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
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-zinc-950/95 px-3 py-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
        <button type="button" onClick={onPrev} className="ui-btn-secondary min-h-11 px-4 py-2 text-sm">
          Prev
        </button>
        <div className="flex gap-1">
          {([1, 2, 3, 4, 5] as const).map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => onRate(rating)}
              className="min-h-11 min-w-11 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-zinc-200"
            >
              {rating}
            </button>
          ))}
        </div>
        <button type="button" onClick={onFavorite} className="ui-btn-secondary min-h-11 px-3 py-2 text-sm">
          ★
        </button>
        <button type="button" onClick={onNext} className="ui-btn-secondary min-h-11 px-4 py-2 text-sm">
          Next
        </button>
      </div>
    </div>
  );
}
