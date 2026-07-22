"use client";

import type { ReactNode } from "react";

type MobileStickyQueueBarProps = {
  disabled?: boolean;
  label?: string;
  onQueue: () => void;
  status?: string | null;
  children?: ReactNode;
};

/** Touch-first sticky queue CTA for phone viewports. */
export default function MobileStickyQueueBar({
  disabled,
  label = "Queue",
  onQueue,
  status,
  children,
}: MobileStickyQueueBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto border-t border-zinc-800/90 bg-zinc-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
        {children}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={onQueue}
            className="min-h-12 flex-1 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 px-4 text-sm font-semibold text-white transition hover:from-violet-400 hover:to-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {label}
          </button>
          {status ? (
            <p className="max-w-[40%] truncate text-[11px] text-zinc-500">{status}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
