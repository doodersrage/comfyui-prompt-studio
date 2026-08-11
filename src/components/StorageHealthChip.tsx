'use client';

import Link from 'next/link';
import { useBrowserStorageHealth } from '@/hooks/useBrowserStorageHealth';
import { settingsTabHref } from '@/lib/settings-nav';

function formatSavedAt(timestamp: number | null): string {
  if (!timestamp) {
    return 'not saved yet';
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  return new Date(timestamp).toLocaleTimeString();
}

/** Compact storage status for Settings Overview / system tray. */
export default function StorageHealthChip({ className = '' }: { className?: string }) {
  const health = useBrowserStorageHealth();
  const label = !health.ready
    ? 'Loading browser storage…'
    : health.lastError
      ? `Storage error · ${health.lastError}`
      : health.dirtyCount > 0
        ? `Saving ${health.dirtyCount} change${health.dirtyCount === 1 ? '' : 's'}…`
        : `Saved ${formatSavedAt(health.lastSavedAt)}`;

  const tone = health.lastError
    ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
    : !health.ready || health.dirtyCount > 0
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
      : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';

  return (
    <Link
      href={settingsTabHref('data')}
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:scale-[0.99] ${tone} ${className}`}
      title="Browser storage health — settings, LoRAs, and history"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          health.lastError
            ? 'bg-rose-400'
            : !health.ready || health.dirtyCount > 0
              ? 'bg-amber-300'
              : 'bg-emerald-400'
        }`}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
