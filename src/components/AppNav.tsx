"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { featureForPath } from "@/lib/auth/features";
import { canAccessNavFeature, useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import ThemePreferenceControl from "@/components/ThemePreferenceControl";
import { BUILTIN_TOOL_PLUGINS, type ToolPlugin } from "@/lib/tool-plugin-registry";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { prefetchGalleryPage } from "@/lib/gallery-warmup";
import {
  APP_NAV_GROUPS,
  APP_NAV_SETTINGS_LINK,
  mergePluginLinksIntoNav,
  type AppNavLink,
} from "@/lib/app-nav-catalog";
import {
  defaultExpandedNavGroups,
  loadWorkspaceMode,
  navGroupsForWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import WorkspaceModeControl from "@/components/WorkspaceModeControl";
import {
  isNavFavorite,
  loadNavFavorites,
  toggleNavFavorite,
} from "@/lib/nav-favorites";
import {
  loadExpandedNavGroups,
  saveExpandedNavGroups,
  toggleExpandedNavGroup,
} from "@/lib/nav-expanded-groups";
import BrandMark from "@/components/BrandMark";
import ConnectionHealthChip from "@/components/ConnectionHealthChip";
import { pushRecentDestination } from "@/lib/recent-destinations";
import { saveLastToolRoute } from "@/lib/last-tool-route";

function linkIsActive(link: AppNavLink, pathname: string, search: string): boolean {
  const [path, query = ""] = link.href.split("?");
  const normalizedPath = path || "/";
  if (pathname !== normalizedPath) {
    return false;
  }
  const current = new URLSearchParams(search);
  if (!query) {
    if (normalizedPath === "/variations") {
      return !current.has("matrix");
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
  return (
    <div className="group/nav flex items-center gap-0.5">
      <Link
        href={link.href}
        title={link.description}
        data-active={active ? "true" : "false"}
        className="ui-nav-link min-w-0 flex-1"
        onMouseEnter={() => {
          if (link.href === "/gallery") {
            prefetchGalleryPage();
          }
        }}
        onFocus={() => {
          if (link.href === "/gallery") {
            prefetchGalleryPage();
          }
        }}
        onClick={() => {
          if (link.href === "/gallery") {
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
          title={favorited ? "Unpin" : "Pin"}
          className={`shrink-0 rounded-[var(--radius-md)] px-1.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            favorited
              ? "text-[var(--accent-text)] opacity-100"
              : "text-[var(--text-muted)] opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100"
          }`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorited ? "★" : "☆"}
        </button>
      ) : null}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { authEnabled, user, allowedFeatures, logout, impersonating, impersonatorUsername, refresh } =
    useAuth();
  const [customPlugins, setCustomPlugins] = useState<ToolPlugin[]>([]);
  const [manifestNavLinks, setManifestNavLinks] = useState<AppNavLink[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[] | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("studio");

  useEffect(() => {
    scheduleAfterCommit(() => {
      setFavorites(loadNavFavorites());
      setWorkspaceMode(loadWorkspaceMode());
    });
    const onStorage = () => {
      setFavorites(loadNavFavorites());
      setWorkspaceMode(loadWorkspaceMode());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onStorage);
    };
  }, []);

  useEffect(() => {
    const builtinIds = new Set(BUILTIN_TOOL_PLUGINS.map((entry) => entry.id));
    const knownHrefs = new Set(
      APP_NAV_GROUPS.flatMap((group) =>
        group.links.map((link) => link.href.split("?")[0] ?? link.href),
      ),
    );

    const loadPlugins = () => {
      void Promise.all([
        import("@/lib/tool-plugin-registry"),
        import("@/lib/plugin-manifest"),
      ]).then(([{ loadToolPlugins }, { navLinksFromInstalledPlugins }]) => {
        setCustomPlugins(
          loadToolPlugins().filter(
            (entry) =>
              !builtinIds.has(entry.id) &&
              !knownHrefs.has(entry.href.split("?")[0] ?? entry.href),
          ),
        );
        setManifestNavLinks(navLinksFromInstalledPlugins());
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(loadPlugins, { timeout: 5000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(loadPlugins, 1500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const visibleGroups = useMemo(() => {
    const bookmarkLinks: AppNavLink[] = customPlugins.map((plugin) => ({
      href: plugin.href,
      label: plugin.label,
      description: plugin.description,
    }));
    const pluginLinks = [...bookmarkLinks, ...manifestNavLinks];
    const catalog = navGroupsForWorkspaceMode(
      workspaceMode,
      mergePluginLinksIntoNav(APP_NAV_GROUPS, pluginLinks),
    );

    return catalog
      .map((group) => ({
        ...group,
        links: group.links.filter((link) =>
          canAccessNavFeature(
            allowedFeatures,
            featureForPath(link.href.split("?")[0] ?? link.href),
          ),
        ),
      }))
      .filter((group) => group.links.length > 0);
  }, [allowedFeatures, customPlugins, manifestNavLinks, workspaceMode]);

  const allLinks = useMemo(
    () => [
      ...visibleGroups.flatMap((group) => group.links),
      ...(canAccessNavFeature(allowedFeatures, "settings")
        ? [APP_NAV_SETTINGS_LINK]
        : []),
    ],
    [allowedFeatures, visibleGroups],
  );

  const pinnedLinks = useMemo(() => {
    const byHref = new Map(allLinks.map((link) => [link.href, link]));
    return favorites
      .map((href) => byHref.get(href))
      .filter((link): link is AppNavLink => Boolean(link));
  }, [allLinks, favorites]);

  useEffect(() => {
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
      const activeGroup = visibleGroups.find((group) =>
        group.links.some((link) => linkIsActive(link, pathname, search)),
      );
      scheduleAfterCommit(() => {
        setExpandedGroups(
          [
            ...defaultExpandedNavGroups(workspaceMode, visibleGroups).slice(0, 1),
            ...(activeGroup ? [activeGroup.label] : []),
          ].filter((label, index, list) => list.indexOf(label) === index),
        );
      });
      return;
    }
    scheduleAfterCommit(() => {
      setExpandedGroups(defaultExpandedNavGroups(workspaceMode, visibleGroups));
    });
  }, [expandedGroups, favorites.length, pathname, search, visibleGroups, workspaceMode]);

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
      allLinks.find((link) => linkIsActive(link, pathname, search)) ??
      allLinks.find((link) => (link.href.split("?")[0] || "/") === pathname);
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
    const activeGroup = visibleGroups.find((group) =>
      group.links.some((link) => linkIsActive(link, pathname, search)),
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

  const settingsVisible = canAccessNavFeature(allowedFeatures, "settings");
  const profileVisible = authEnabled && Boolean(user);
  const openGroups = expandedGroups ?? visibleGroups.map((group) => group.label);

  function handleToggleFavorite(href: string) {
    setFavorites(toggleNavFavorite(href));
  }

  function handleToggleGroup(label: string) {
    const next = toggleExpandedNavGroup(label, openGroups);
    setExpandedGroups(next);
  }

  async function endImpersonation() {
    await fetch("/api/auth/impersonate", { method: "DELETE" });
    await refresh();
    window.location.href = "/settings?tab=users";
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {impersonating ? (
        <div className="mx-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
          Viewing as <span className="font-medium">{user?.username}</span>
          {impersonatorUsername ? ` (admin: ${impersonatorUsername})` : ""}.
          <button
            type="button"
            onClick={() => void endImpersonation()}
            className="mt-2 block text-amber-200 underline underline-offset-2"
          >
            Exit impersonation
          </button>
        </div>
      ) : null}
      <div className="px-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="ui-nav-brand inline-flex items-center gap-2.5 rounded-[var(--radius-md)] px-1 py-1 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
        >
          <BrandMark size={32} withWordmark wordmarkClassName="type-title tracking-tight" />
        </Link>
        <p className="type-caption mt-1 px-3">
          for ComfyUI{" "}
          <span className="text-[var(--text-muted)]">· ⌘K</span>
        </p>
      </div>

      <div className="sidebar-scroll flex-1 space-y-4 overflow-y-auto px-2 pb-2">
        {pinnedLinks.length > 0 ? (
          <div className="space-y-2">
            <p className="type-overline px-3">Pinned</p>
            <div className="space-y-1">
              {pinnedLinks.map((link) => (
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
          </div>
        ) : null}

        {visibleGroups.map((group) => {
          const expanded = openGroups.includes(group.label);
          return (
            <div key={group.label} className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-1 text-left transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                aria-expanded={expanded}
                onClick={() => handleToggleGroup(group.label)}
              >
                <span className="type-overline">{group.label}</span>
                <span className="type-caption text-[var(--text-muted)]" aria-hidden>
                  {expanded ? "▾" : "▸"}
                </span>
              </button>
              {expanded ? (
                <div className="space-y-1">
                  {group.links.map((link) => (
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
      </div>

      <div className="space-y-3 border-t border-[var(--border-subtle)] px-2 pt-4">
        <div className="px-1" onClick={onNavigate}>
          <ConnectionHealthChip compact />
        </div>
        <WorkspaceModeControl
          variant="chips"
          onChanged={(mode) => {
            setWorkspaceMode(mode);
            setExpandedGroups(null);
            saveExpandedNavGroups([]);
          }}
        />
        <div className="px-1">
          <ThemePreferenceControl showHint={false} />
        </div>
        <div className="flex justify-end px-1">
          <NotificationBell />
        </div>
        {authEnabled && user ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">{user.username}</p>
            <p className="type-caption mt-0.5 capitalize text-[var(--text-muted)]">{user.role}</p>
            {profileVisible ? (
              <Link
                href="/profile"
                onClick={onNavigate}
                className="mt-2 block text-xs text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Profile & preferences
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-2 block text-xs text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Sign out
            </button>
          </div>
        ) : null}
        {settingsVisible ? (
          <div onClick={onNavigate}>
            <SidebarLink
              link={APP_NAV_SETTINGS_LINK}
              active={pathname === APP_NAV_SETTINGS_LINK.href}
              favorited={isNavFavorite(APP_NAV_SETTINGS_LINK.href, favorites)}
              onToggleFavorite={() => handleToggleFavorite(APP_NAV_SETTINGS_LINK.href)}
            />
          </div>
        ) : null}
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
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 backdrop-blur-md lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] py-0.5 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99]"
        >
          <BrandMark size={28} withWordmark wordmarkClassName="type-heading tracking-tight" />
        </Link>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileOpen((open) => !open)}
          className="ui-btn-secondary px-3 py-2"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
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
        className={`fixed inset-y-0 left-0 z-50 w-[var(--sidebar-width)] border-r border-[var(--border-subtle)] bg-[var(--bg-muted)] py-5 backdrop-blur-md transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
