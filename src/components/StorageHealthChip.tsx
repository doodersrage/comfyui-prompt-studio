'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useBrowserStorageHealth } from '@/hooks/useBrowserStorageHealth';
import { flushBrowserStorageNow } from '@/lib/browser-storage';
import { settingsTabHref } from '@/lib/settings-nav';
import { pushAppToast } from '@/lib/app-toast';

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
  const [retrying, setRetrying] = useState(false);
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

  const retryFlush = async () => {
    if (retrying) {
      return;
    }
    setRetrying(true);
    try {
      await flushBrowserStorageNow();
      pushAppToast({ text: 'Storage flush complete', tone: 'success', ttlMs: 2500 });
    } catch (error) {
      pushAppToast({
        text: error instanceof Error ? error.message : 'Storage flush failed',
        tone: 'danger',
        ttlMs: 5000,
        href: settingsTabHref('data'),
      });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`inline-flex max-w-full flex-wrap items-center gap-2 ${className}`}>
      <Link
        href={settingsTabHref('data')}
        className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:scale-[0.99] ${tone}`}
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
      {health.lastError || health.dirtyCount > 0 ? (
        <button
          type="button"
          onClick={() => void retryFlush()}
          disabled={retrying}
          className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:scale-[0.99] disabled:opacity-60"
        >
          {retrying ? 'Retrying…' : 'Retry save'}
        </button>
      ) : null}
      {health.lastError ? (
        <Link
          href={settingsTabHref('data')}
          className="rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-100 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:scale-[0.99]"
        >
          Export backup
        </Link>
      ) : null}
    </div>
  );
}
