"use client";

import type { ReactNode } from "react";

type MobileStickyQueueBarProps = {
  disabled?: boolean;
  label?: string;
  onQueue: () => void;
  status?: string | null;
  children?: ReactNode;
};

/** Touch-first sticky queue CTA for phone viewports — uses design tokens. */
export default function MobileStickyQueueBar({
  disabled,
  label = "Queue",
  onQueue,
  status,
  children,
}: MobileStickyQueueBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto border-t border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-elevated)_92%,transparent)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_48px_-24px_color-mix(in_oklab,var(--bg-base)_80%,transparent)] backdrop-blur-md">
        {children}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={onQueue}
            className="ui-btn-primary min-h-12 flex-1 px-4 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {label}
          </button>
          {status ? (
            <p className="max-w-[40%] truncate text-[11px] text-[var(--text-muted)]">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
