'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { featureForPath } from '@/lib/auth/features';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import NotificationBell from '@/components/NotificationBell';
import ThemePreferenceControl from '@/components/ThemePreferenceControl';
import { BUILTIN_TOOL_PLUGINS, type ToolPlugin } from '@/lib/tool-plugin-registry';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { prefetchGalleryPage } from '@/lib/gallery-warmup';
import { resolveAppNavLinkHref } from '@/lib/gallery-session-state';
import {
  APP_NAV_GROUPS,
  APP_NAV_SETTINGS_LINK,
  mergePluginLinksIntoNav,
  type AppNavLink,
} from '@/lib/app-nav-catalog';
import {
  defaultExpandedNavGroups,
  isRoleplayFocusPath,
  navGroupsForPath,
} from '@/lib/workspace-mode';
import { PLUGIN_MANIFEST_UPDATED_EVENT } from '@/lib/plugin-manifest';
import { NSFW_GENERATOR_NAV_LINK } from '@/lib/nsfw-generator-nav';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import WorkspaceModeControl from '@/components/WorkspaceModeControl';
import { isNavFavorite, loadNavFavorites, toggleNavFavorite } from '@/lib/nav-favorites';
import {
  loadExpandedNavGroups,
  saveExpandedNavGroups,
  toggleExpandedNavGroup,
} from '@/lib/nav-expanded-groups';
import BrandMark from '@/components/BrandMark';
import ConnectionHealthChip from '@/components/ConnectionHealthChip';
import ActiveJobsChip from '@/components/ActiveJobsChip';
import ReportBugLink from '@/components/ReportBugLink';
import { pushRecentDestination } from '@/lib/recent-destinations';
import { saveLastToolRoute } from '@/lib/last-tool-route';

function linkIsActive(link: AppNavLink, pathname: string, search: string): boolean {
  const [path, query = ''] = link.href.split('?');
  const normalizedPath = path || '/';
  if (pathname !== normalizedPath) {
    if (normalizedPath === '/characters' && pathname.startsWith('/characters/')) {
      return !query;
    }
    return false;
  }
  const current = new URLSearchParams(search);
  if (!query) {
    if (normalizedPath === '/variations') {
      return !current.has('matrix');
    }
    return true;
  }
  const required = new URLSearchParams(query);
  for (const [key, value] of required.entries()) {
    if (current.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function SidebarLink({
  link,
  active,
  favorited,
  onToggleFavorite,
}: {
  link: AppNavLink;
  active: boolean;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const navHref = resolveAppNavLinkHref(link.href);
  const galleryPath = link.href.split('?')[0] ?? link.href;
  const isGalleryLink = galleryPath === '/gallery' || galleryPath === '/m/gallery';

  return (
    <div className="group/nav flex items-center gap-0.5">
      <Link
        href={navHref}
        title={link.description}
        data-active={active ? 'true' : 'false'}
        className="ui-nav-link min-w-0 flex-1"
        onMouseEnter={() => {
          if (isGalleryLink) {
            prefetchGalleryPage();
          }
        }}
        onFocus={() => {
          if (isGalleryLink) {
            prefetchGalleryPage();
          }
        }}
        onClick={() => {
          if (isGalleryLink) {
            prefetchGalleryPage();
          }
        }}
      >
        {link.label}
      </Link>
      {onToggleFavorite ? (
        <button
          type="button"
          aria-label={favorited ? `Unpin ${link.label}` : `Pin ${link.label}`}
          title={favorited ? 'Unpin' : 'Pin'}
          className={`shrink-0 rounded-[var(--radius-md)] px-1.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            favorited
              ? 'text-[var(--accent-text)] opacity-100'
              : 'text-[var(--text-muted)] opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100'
          }`}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorited ? '★' : '☆'}
        </button>
      ) : null}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  // Defer null-check to after all hooks so hook-call order stays stable.
  // AuthProvider always supplies a value now; fallback is only for HMR edge cases.
  const rawAuth = useAuth();
  const isNullContext = !rawAuth;

  const {
    authEnabled,
    user,
    allowedFeatures,
    logout,
    impersonating,
    impersonatorUsername,
    refresh,
    loading,
  } = rawAuth ?? {
    loading: true,
    authEnabled: false,
    user: null,
    allowedFeatures: 'all' as const,
    impersonating: false,
    refresh: async () => {},
    logout: async () => {},
    isAdmin: false,
  };

  const [customPlugins, setCustomPlugins] = useState<ToolPlugin[]>([]);
  const [manifestNavLinks, setManifestNavLinks] = useState<AppNavLink[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[] | null>(null);
  const workspaceMode = useWorkspaceMode();
  const nsfwGeneratorEnabled = useNsfwGeneratorEnabled();

  useEffect(() => {
    scheduleAfterCommit(() => {
      setFavorites(loadNavFavorites());
    });
    const onStorage = () => {
      setFavorites(loadNavFavorites());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
    };
  }, []);

  useEffect(() => {
    if (isNullContext) return; // provider not wired up yet during HMR/SSR
    const builtinIds = new Set(BUILTIN_TOOL_PLUGINS.map(entry => entry.id));
    const knownHrefs = new Set(
      APP_NAV_GROUPS.flatMap(group => group.links.map(link => link.href.split('?')[0] ?? link.href))
    );

    const loadPlugins = () => {
      void Promise.all([
        import('@/lib/tool-plugin-registry'),
        import('@/lib/plugin-manifest'),
      ]).then(([{ loadToolPlugins }, { navLinksFromInstalledPlugins }]) => {
        setCustomPlugins(
          loadToolPlugins().filter(
            entry =>
              !builtinIds.has(entry.id) && !knownHrefs.has(entry.href.split('?')[0] ?? entry.href)
          )
        );
        setManifestNavLinks(navLinksFromInstalledPlugins());
      });
    };

    window.addEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, loadPlugins);

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(loadPlugins, { timeout: 5000 });
      return () => {
        window.cancelIdleCallback(idleId);
        window.removeEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, loadPlugins);
      };
    }

    const timeoutId = window.setTimeout(loadPlugins, 1500);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, loadPlugins);
    };
  }, [isNullContext]);

  const visibleGroups = useMemo(() => {
    // Return a placeholder group during SSR or before AuthProvider resolves.
    // This keeps hydration element count consistent — React reconciles real groups after hydration.
    if (isNullContext || loading) {
      return [{ label: '__placeholder__', links: [] as AppNavLink[] }];
    }

    const bookmarkLinks: AppNavLink[] = customPlugins.map(plugin => ({
      href: plugin.href,
      label: plugin.label,
      description: plugin.description,
    }));
    const envGatedLinks = nsfwGeneratorEnabled ? [NSFW_GENERATOR_NAV_LINK] : [];
    const pluginLinks = [...bookmarkLinks, ...manifestNavLinks, ...envGatedLinks];
    const catalog = navGroupsForPath(
      workspaceMode,
      pathname,
      mergePluginLinksIntoNav(APP_NAV_GROUPS, pluginLinks)
    );

    return catalog
      .map(group => ({
        ...group,
        links: group.links.filter(link =>
          canAccessNavFeature(allowedFeatures, featureForPath(link.href.split('?')[0] ?? link.href))
        ),
      }))
      .filter(group => group.links.length > 0);
  }, [
    isNullContext,
    allowedFeatures,
    loading,
    customPlugins,
    manifestNavLinks,
    pathname,
    workspaceMode,
    nsfwGeneratorEnabled,
  ]);

  const allLinks = useMemo(
    () =>
      isNullContext
        ? [APP_NAV_SETTINGS_LINK]
        : [
            ...visibleGroups
              .filter(g => g.label !== '__placeholder__')
              .flatMap(group => group.links),
            ...(canAccessNavFeature(allowedFeatures, 'settings') ? [APP_NAV_SETTINGS_LINK] : []),
          ],
    [isNullContext, allowedFeatures, visibleGroups]
  );

  const pinnedLinks = useMemo(() => {
    const byHref = new Map(allLinks.map(link => [link.href, link]));
    return favorites
      .map(href => byHref.get(href))
      .filter((link): link is AppNavLink => Boolean(link));
  }, [allLinks, favorites]);

  useEffect(() => {
    if (isNullContext) return;
    if (expandedGroups !== null || visibleGroups.length === 0) {
      return;
    }
    const saved = loadExpandedNavGroups();
    if (saved && saved.length > 0) {
      scheduleAfterCommit(() => {
        setExpandedGroups(saved);
      });
      return;
    }
    if (favorites.length > 0) {
      const activeGroup = visibleGroups.find(group =>
        group.links.some(link => linkIsActive(link, pathname, search))
      );
      scheduleAfterCommit(() => {
        setExpandedGroups(
          [
            ...defaultExpandedNavGroups(workspaceMode, visibleGroups).slice(0, 1),
            ...(activeGroup ? [activeGroup.label] : []),
          ].filter((label, index, list) => list.indexOf(label) === index)
        );
      });
      return;
    }
    scheduleAfterCommit(() => {
      setExpandedGroups(defaultExpandedNavGroups(workspaceMode, visibleGroups));
    });
  }, [
    isNullContext,
    expandedGroups,
    favorites.length,
    pathname,
    search,
    visibleGroups,
    workspaceMode,
  ]);

  // When workspace mode changes, re-seed expand defaults (unless user already toggled).
  useEffect(() => {
    const saved = loadExpandedNavGroups();
    if (saved && saved.length > 0) {
      return;
    }
    scheduleAfterCommit(() => {
      setExpandedGroups(defaultExpandedNavGroups(workspaceMode, visibleGroups));
    });
  }, [workspaceMode]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional mode switch reset

  useEffect(() => {
    const match =
      allLinks.find(link => linkIsActive(link, pathname, search)) ??
      allLinks.find(link => (link.href.split('?')[0] || '/') === pathname);
    if (!match) {
      return;
    }
    pushRecentDestination({ href: match.href, label: match.label });
    saveLastToolRoute(match.href);
  }, [allLinks, pathname, search]);

  // Ensure the group containing the current route is open without collapsing others.
  useEffect(() => {
    if (expandedGroups === null) {
      return;
    }
    const activeGroup = visibleGroups.find(group =>
      group.links.some(link => linkIsActive(link, pathname, search))
    );
    if (!activeGroup || expandedGroups.includes(activeGroup.label)) {
      return;
    }
    const next = [...expandedGroups, activeGroup.label];
    scheduleAfterCommit(() => {
      setExpandedGroups(next);
    });
    saveExpandedNavGroups(next);
  }, [expandedGroups, pathname, search, visibleGroups]);

  const settingsVisible = canAccessNavFeature(allowedFeatures, 'settings');
  const profileVisible = authEnabled && Boolean(user);
  /** Auth on but session not ready or signed out — keep chrome minimal (login/forbidden). */
  const guestShell = authEnabled && !user;
  const navReady = !loading && (!authEnabled || Boolean(user));
  const roleplayFocus = isRoleplayFocusPath(pathname);
  const openGroups = expandedGroups ?? visibleGroups.map(group => group.label);

  function handleToggleFavorite(href: string) {
    setFavorites(toggleNavFavorite(href));
  }

  function handleToggleGroup(label: string) {
    const next = toggleExpandedNavGroup(label, openGroups);
    setExpandedGroups(next);
  }

  async function endImpersonation() {
    await fetch('/api/auth/impersonate', { method: 'DELETE' });
    await refresh();
    window.location.href = '/settings?tab=users';
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {impersonating ? (
        <div className="ui-alert-warning mx-2">
          Viewing as <span className="font-medium">{user?.username}</span>
          {impersonatorUsername ? ` (admin: ${impersonatorUsername})` : ''}.
          <button
            type="button"
            onClick={() => void endImpersonation()}
            className="ui-text-link mt-2 block"
          >
            Exit impersonation
          </button>
        </div>
      ) : null}
      <div className="px-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="ui-nav-brand inline-flex items-center gap-2.5 rounded-[var(--radius-md)] px-1 py-1 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          <BrandMark
            size={32}
            withWordmark
            wordmarkClassName="type-brand type-title tracking-tight"
          />
        </Link>
        <p className="type-caption mt-1.5 px-3 text-[var(--text-tertiary)]">
          Prompt · queue · gallery
          <span className="mx-1.5 text-[var(--border-strong)]">·</span>
          <kbd className="ui-kbd">⌘K</kbd>
        </p>
      </div>

      <div className="sidebar-scroll ui-scroll-region flex-1 space-y-4 overflow-y-auto px-2 pb-2">
        {navReady ? (
          <>
            <div key="pinned" className="space-y-2">
              {pinnedLinks.length > 0 ? (
                <>
                  <p className="type-overline px-3">Pinned</p>
                  <div className="space-y-1">
                    {pinnedLinks.map(link => (
                      <div key={`pinned-${link.href}`} onClick={onNavigate}>
                        <SidebarLink
                          link={link}
                          active={linkIsActive(link, pathname, search)}
                          favorited
                          onToggleFavorite={() => handleToggleFavorite(link.href)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            {visibleGroups.map(group => {
              const expanded = openGroups.includes(group.label);
              const isMoreTools = workspaceMode === 'simple' && group.label === 'More tools';
              const groupLabel =
                isMoreTools && !expanded ? `${group.label} (${group.links.length})` : group.label;
              return (
                <div key={group.label} className="space-y-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-1 text-left transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-expanded={expanded}
                    onClick={() => handleToggleGroup(group.label)}
                  >
                    <span className="type-overline">{groupLabel}</span>
                    <span className="type-caption text-[var(--text-muted)]" aria-hidden>
                      {expanded ? '▾' : '▸'}
                    </span>
                  </button>
                  {isMoreTools && !expanded ? (
                    <p className="type-caption px-3 text-[var(--text-muted)]">
                      Press{' '}
                      <kbd className="rounded border border-[var(--border-default)] px-1">⌘K</kbd>{' '}
                      to jump to any tool
                    </p>
                  ) : null}
                  {expanded ? (
                    <div className="space-y-1">
                      {group.links.map(link => (
                        <div key={link.href} onClick={onNavigate}>
                          <SidebarLink
                            link={link}
                            active={linkIsActive(link, pathname, search)}
                            favorited={isNavFavorite(link.href, favorites)}
                            onToggleFavorite={() => handleToggleFavorite(link.href)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : guestShell ? (
          <p className="type-caption px-3 text-[var(--text-muted)]">
            Sign in to open tools, pin destinations, and save workspace preferences.
          </p>
        ) : null}
      </div>

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
          {profileVisible || false ? (
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
          {(authEnabled && user) || false ? (
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
            <SidebarLink
              link={APP_NAV_SETTINGS_LINK}
              active={pathname === APP_NAV_SETTINGS_LINK.href}
              favorited={isNavFavorite(APP_NAV_SETTINGS_LINK.href, favorites)}
              onToggleFavorite={() => handleToggleFavorite(APP_NAV_SETTINGS_LINK.href)}
            />
          </div>
        ) : null}
        <ReportBugLink className="mt-1 block px-3 py-1.5 text-xs text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
      </div>
    </div>
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMobileOpen(false);
    });
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] py-0.5 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          <BrandMark
            size={28}
            withWordmark
            wordmarkClassName="type-brand type-heading tracking-tight"
          />
        </Link>
        <div className="flex items-center gap-2">
          <ActiveJobsChip />
          <Link href="/m" className="ui-btn-secondary px-3 py-2">
            Phone
          </Link>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen(open => !open)}
            className="ui-btn-secondary px-3 py-2"
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="ui-overlay fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[var(--sidebar-width)] border-r border-[var(--border-subtle)] bg-[var(--bg-muted)] py-5 transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
