'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import BrandMark from '@/components/BrandMark';
import ReportBugLink from '@/components/ReportBugLink';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { featureForPath } from '@/lib/auth/features';
import { MOBILE_STUDIO_TABS, mobileStudioTabFromPath } from '@/lib/mobile-studio';
import { accentForPath } from '@/lib/tool-theme';

export default function MobileStudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/m';
  const tab = mobileStudioTabFromPath(pathname);
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const tabs = MOBILE_STUDIO_TABS.filter(entry =>
    canAccessNavFeature(allowed, featureForPath(entry.href))
  );

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
                'Phone companion — Capture, Queue, Gallery, Play stills'}
              <span className="mx-1 text-[var(--border-strong)]">·</span>
              <ReportBugLink className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="ui-btn-secondary shrink-0 px-3 py-2 text-xs"
          title="Desk app — Fitting, Day, Moodboard, Cut film"
        >
          Desk
        </Link>
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
