'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import BrandMark from '@/components/BrandMark';
import ReportBugLink from '@/components/ReportBugLink';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { featureForPath } from '@/lib/auth/features';
import { MOBILE_STUDIO_TABS, mobileStudioTabFromPath } from '@/lib/mobile-studio';
import { loadSettingsCache } from '@/lib/settings-cache';
import { accentForPath } from '@/lib/tool-theme';

function deskBridgeHrefs(): { play: string; day: string; fitting: string } {
  const characterId =
    typeof window !== 'undefined' ? loadSettingsCache().shared.activeCharacterId?.trim() || '' : '';
  const q = characterId ? `?character=${encodeURIComponent(characterId)}` : '';
  return {
    play: characterId ? `/play${q}` : '/play',
    day: characterId ? `/day${q}` : '/day',
    fitting: characterId ? `/fitting${q}` : '/fitting',
  };
}

export default function MobileStudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/m';
  const tab = mobileStudioTabFromPath(pathname);
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const tabs = MOBILE_STUDIO_TABS.filter(entry =>
    canAccessNavFeature(allowed, featureForPath(entry.href))
  );
  const desk = deskBridgeHrefs();

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]"
      data-accent={accent}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={28} />
          <div className="min-w-0">
            <p className="type-brand type-heading truncate tracking-tight">Mobile Studio</p>
            <p className="type-caption text-[var(--text-muted)]">
              {MOBILE_STUDIO_TABS.find(entry => entry.id === tab)?.hint ??
                'Capture → Queue → Rate → Desk Continue'}
              <span className="mx-1 text-[var(--border-strong)]">·</span>
              <ReportBugLink className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1" data-testid="mobile-desk-bridge">
          <Link
            href="/dashboard"
            className="ui-btn-secondary shrink-0 px-3 py-2 text-xs"
            title="Continue film loop on desk (Fitting · Day · Cut)"
          >
            Desk
          </Link>
          <div className="flex flex-wrap justify-end gap-1">
            <Link
              href={desk.play}
              className="type-caption text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
              data-testid="mobile-desk-play"
            >
              Campaign
            </Link>
            <span className="type-caption text-[var(--border-strong)]">·</span>
            <Link
              href={desk.day}
              className="type-caption text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
              data-testid="mobile-desk-day"
            >
              Day
            </Link>
            <span className="type-caption text-[var(--border-strong)]">·</span>
            <Link
              href={desk.fitting}
              className="type-caption text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
              data-testid="mobile-desk-fitting"
            >
              Fitting
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <nav
        aria-label="Mobile Studio"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-muted)] pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4 gap-0.5 px-2 py-2">
          {tabs.map(entry => {
            const active = entry.id === tab;
            return (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  data-active={active ? 'true' : 'false'}
                  className={[
                    'flex flex-col items-center rounded-[var(--radius-md)] px-2 py-2 text-center transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                    active
                      ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  <span className="text-sm font-medium">{entry.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
