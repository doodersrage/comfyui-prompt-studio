'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import ReportBugLink from '@/components/ReportBugLink';
import WorkspaceModeControl from '@/components/WorkspaceModeControl';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { featureForPath } from '@/lib/auth/features';
import { APP_NAV_PROFILE_LINK, APP_NAV_SETTINGS_LINK } from '@/lib/app-nav-catalog';
import { ROLEPLAY_FOCUS_ESCAPE_HREF } from '@/lib/workspace-mode';
import { galleryNavHref } from '@/lib/gallery-session-state';
import { accentForPath } from '@/lib/tool-theme';

const PLAY_KIOSK_TABS: { href: string; label: string }[] = [
  { href: '/characters', label: 'Cast' },
  { href: '/fitting', label: 'Fitting' },
  { href: '/day', label: 'Day' },
  { href: '/roleplay', label: 'Roleplay' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/queue', label: 'Queue' },
];

function tabIsActive(href: string, pathname: string): boolean {
  if (href === '/characters') {
    return pathname === '/characters' || pathname.startsWith('/characters/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PlayKioskShell() {
  const pathname = usePathname() ?? '/roleplay';
  const galleryHref = galleryNavHref('/gallery');
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const tabs = PLAY_KIOSK_TABS.filter(entry =>
    canAccessNavFeature(allowed, featureForPath(entry.href))
  );
  const settingsVisible = canAccessNavFeature(allowed, 'settings');

  return (
    <div data-accent={accent}>
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_88%,transparent)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={28} />
          <div className="min-w-0">
            <p className="type-brand type-heading truncate tracking-tight">Play</p>
            <p className="type-caption text-[var(--text-muted)]">
              Cast · Fitting · Day · Roleplay · Gallery · Queue
              <span className="mx-1 text-[var(--border-strong)]">·</span>
              <ReportBugLink className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <WorkspaceModeControl variant="chips" />
          {settingsVisible ? (
            <Link href={APP_NAV_SETTINGS_LINK.href} className="ui-btn-secondary px-3 py-2 text-xs">
              Settings
            </Link>
          ) : null}
          <Link href={APP_NAV_PROFILE_LINK.href} className="ui-btn-secondary px-3 py-2 text-xs">
            Profile
          </Link>
          <Link href={ROLEPLAY_FOCUS_ESCAPE_HREF} className="ui-btn-secondary px-3 py-2 text-xs">
            All tools
          </Link>
        </div>
      </header>
      <nav
        aria-label="Play"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-6 gap-0.5 px-2 py-2">
          {tabs.map(entry => {
            const active = tabIsActive(entry.href, pathname);
            const href = entry.href === '/gallery' ? galleryHref : entry.href;
            return (
              <li key={entry.href}>
                <Link
                  href={href}
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
