'use client';

import Link from 'next/link';
import { isRoleplayFocusPath } from '@/lib/workspace-mode';
import { APP_NAV_SETTINGS_LINK } from '@/lib/app-nav-catalog';
import { saveExpandedNavGroups } from '@/lib/nav-expanded-groups';
import { isNavFavorite } from '@/lib/nav-favorites';
import NotificationBell from '@/components/NotificationBell';
import ThemePreferenceControl from '@/components/ThemePreferenceControl';
import WorkspaceModeControl from '@/components/WorkspaceModeControl';
import ConnectionHealthChip from '@/components/ConnectionHealthChip';
import ActiveJobsChip from '@/components/ActiveJobsChip';
import ReportBugLink from '@/components/ReportBugLink';
import { AppNavSidebarLink } from '@/components/app-nav/AppNavSidebarLink';
import type { AppNavSidebarViewModel } from '@/components/app-nav/useAppNavSidebar';

type Props = Pick<
  AppNavSidebarViewModel,
  | 'pathname'
  | 'authEnabled'
  | 'user'
  | 'logout'
  | 'navReady'
  | 'workspaceMode'
  | 'settingsVisible'
  | 'profileVisible'
  | 'guestShell'
  | 'favorites'
  | 'handleToggleFavorite'
  | 'setExpandedGroups'
> & {
  onNavigate?: () => void;
};

export function AppNavSidebarFooter({
  pathname,
  authEnabled,
  user,
  logout,
  navReady,
  workspaceMode,
  settingsVisible,
  profileVisible,
  guestShell,
  favorites,
  handleToggleFavorite,
  setExpandedGroups,
  onNavigate,
}: Props) {
  const roleplayFocus = isRoleplayFocusPath(pathname);

  return (
    <div className="space-y-3 border-t border-[var(--border-subtle)] px-2 pt-4">
      {navReady ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2" onClick={onNavigate}>
            <ConnectionHealthChip compact />
            <ActiveJobsChip compact />
          </div>
          <div className="shrink-0">
            <NotificationBell />
          </div>
        </div>
      ) : null}
      {navReady && !roleplayFocus ? (
        <WorkspaceModeControl
          variant="chips"
          onChanged={() => {
            setExpandedGroups(null);
            saveExpandedNavGroups([]);
          }}
        />
      ) : null}
      {navReady && !roleplayFocus && workspaceMode === 'simple' ? (
        <p className="type-caption px-3 text-[var(--text-muted)]">
          Theme and density in{' '}
          <Link
            href="/profile"
            onClick={onNavigate}
            className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Profile
          </Link>
        </p>
      ) : null}
      {workspaceMode !== 'simple' ? (
        <div className="px-1">
          <ThemePreferenceControl showHint={false} />
        </div>
      ) : null}
      <div
        key="auth-profile"
        className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-elevated)_88%,transparent)] px-3 py-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]"
      >
        <p
          className={
            authEnabled && user
              ? 'text-sm font-medium text-[var(--text-primary)]'
              : 'type-caption mt-0.5 capitalize text-[var(--text-muted)]'
          }
        >
          {authEnabled && user ? user.username : '—'}
        </p>
        <p className="type-caption mt-0.5 capitalize text-[var(--text-muted)]">
          {authEnabled && user ? user.role : 'Guest'}
        </p>
        {profileVisible ? (
          <Link
            href="/profile"
            onClick={onNavigate}
            className="mt-2 block text-xs text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Profile & preferences
          </Link>
        ) : (
          <span className="mt-2" aria-hidden>
            —
          </span>
        )}
        {authEnabled && user ? (
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 block text-xs text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Sign out
          </button>
        ) : guestShell ? (
          <Link
            href="/login"
            onClick={onNavigate}
            className="mt-2 block text-xs text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Sign in
          </Link>
        ) : (
          <span className="mt-2" aria-hidden>
            —
          </span>
        )}
      </div>
      {navReady && settingsVisible ? (
        <div key="settings" onClick={onNavigate}>
          <AppNavSidebarLink
            link={APP_NAV_SETTINGS_LINK}
            active={pathname === APP_NAV_SETTINGS_LINK.href}
            favorited={isNavFavorite(APP_NAV_SETTINGS_LINK.href, favorites)}
            onToggleFavorite={() => handleToggleFavorite(APP_NAV_SETTINGS_LINK.href)}
          />
        </div>
      ) : null}
      <ReportBugLink className="mt-1 block px-3 py-1.5 text-xs text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
    </div>
  );
}
