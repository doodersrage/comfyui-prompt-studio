"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessNavFeature, useAuth } from "@/hooks/useAuth";
import { featureForPath } from "@/lib/auth/features";
import {
  APP_NAV_PROFILE_LINK,
  APP_NAV_SETTINGS_LINK,
  flattenAppNavLinks,
} from "@/lib/app-nav-catalog";
import { SETTINGS_TABS, settingsTabHref } from "@/lib/settings-nav";
import { STUDIO_TABS, studioTabHref } from "@/lib/studio-nav";
import {
  isNavFavorite,
  loadNavFavorites,
  toggleNavFavorite,
} from "@/lib/nav-favorites";
import {
  loadRecentDestinations,
  type RecentDestination,
} from "@/lib/recent-destinations";
import { clearLastToolRoute, loadLastToolRoute } from "@/lib/last-tool-route";
import {
  clearLastToolDraft,
  loadLastToolDraft,
  type ToolDraftSummary,
} from "@/lib/tool-draft-memory";
import type { GlobalSearchResult } from "@/lib/global-search";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import { markOnboardingDiscoverPalette } from "@/lib/onboarding-hooks";

type CommandItem = {
  id: string;
  label: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  group: string;
};

const ACTION_ITEMS: CommandItem[] = [
  {
    id: "sync-now",
    label: "Sync storage now",
    action: () =>
      void import("@/lib/auto-storage-sync").then((m) => m.autoPushStorageDebounced()),
    group: "Actions",
  },
  {
    id: "save-session-recipe",
    label: "Save session snapshot",
    subtitle: "Model, quality, LoRAs, sampler — restore anytime",
    action: () => {
      void import("@/lib/session-recipes").then(async (m) => {
        const { loadSettingsCache } = await import("@/lib/settings-cache");
        const shared = loadSettingsCache().shared;
        const recipe = m.buildSessionRecipeFromShared({ shared });
        m.pushSessionRecipe(recipe);
      });
    },
    group: "Actions",
  },
  {
    id: "restore-session-recipe",
    label: "Restore latest session snapshot",
    subtitle: "Applies the most recent Save session snapshot",
    action: () => {
      void import("@/lib/session-recipes").then(async (m) => {
        const { loadSettingsCache, saveSharedSettings } = await import(
          "@/lib/settings-cache"
        );
        const latest = m.loadSessionRecipes()[0];
        if (!latest) {
          return;
        }
        const next = m.applySessionRecipeShared(loadSettingsCache().shared, latest);
        saveSharedSettings(next);
        window.location.reload();
      });
    },
    group: "Actions",
  },
  {
    id: "review-gallery",
    label: "Open gallery review",
    href: "/gallery?review=1",
    group: "Actions",
  },
  {
    id: "reload",
    label: "Reload page",
    action: () => window.location.reload(),
    group: "Actions",
  },
];

function buildNavItems(): CommandItem[] {
  const nav = flattenAppNavLinks().map((link) => ({
    id: `nav-${link.href}`,
    label: link.label,
    subtitle: link.description,
    href: link.href,
    group: "Navigate",
  }));
  const settingsTabs = SETTINGS_TABS.map((tab) => ({
    id: `settings-${tab.id}`,
    label: `Settings · ${tab.label}`,
    subtitle: tab.description,
    href: settingsTabHref(tab.id),
    group: "Settings",
  }));
  const studioTabs = STUDIO_TABS.map((tab) => ({
    id: `studio-${tab.id}`,
    label: `Studio · ${tab.label}`,
    subtitle: tab.description,
    href: studioTabHref(tab.id),
    group: "Studio",
  }));
  return [
    ...nav,
    {
      id: "nav-settings",
      label: APP_NAV_SETTINGS_LINK.label,
      subtitle: APP_NAV_SETTINGS_LINK.description,
      href: APP_NAV_SETTINGS_LINK.href,
      group: "Navigate",
    },
    {
      id: "nav-profile",
      label: APP_NAV_PROFILE_LINK.label,
      subtitle: APP_NAV_PROFILE_LINK.description,
      href: APP_NAV_PROFILE_LINK.href,
      group: "Navigate",
    },
    ...settingsTabs,
    ...studioTabs,
    ...ACTION_ITEMS,
  ];
}

export default function CommandPalette() {
  const router = useRouter();
  const { allowedFeatures } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentDestination[]>([]);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<ToolDraftSummary | null>(null);
  const [globalMatches, setGlobalMatches] = useState<CommandItem[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pluginNavItems, setPluginNavItems] = useState<CommandItem[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);

  const catalog = useMemo(() => {
    const base = buildNavItems();
    const existing = new Set(base.map((item) => item.href).filter(Boolean));
    const pluginExtras = pluginNavItems.filter(
      (item) => item.href && !existing.has(item.href),
    );
    return [
      ...base,
      ...pluginExtras,
      {
        id: "keyboard-shortcuts",
        label: "Keyboard shortcuts",
        subtitle: "Cheat sheet · palette also lists Resume draft & Continue",
        group: "Actions",
        action: () => {
          setOpen(false);
          setShortcutsOpen(true);
        },
      } satisfies CommandItem,
    ];
  }, [pluginNavItems]);

  const items = useMemo(
    () =>
      catalog.filter((item) => {
        if (!item.href) {
          return true;
        }
        const path = item.href.split("?")[0] ?? item.href;
        const feature = featureForPath(path);
        return canAccessNavFeature(allowedFeatures, feature);
      }),
    [allowedFeatures, catalog],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setFavorites(loadNavFavorites());
    setRecent(loadRecentDestinations());
    setLastRoute(loadLastToolRoute());
    setLastDraft(loadLastToolDraft());
    void import("@/lib/plugin-manifest").then(({ navLinksFromInstalledPlugins }) => {
      setPluginNavItems(
        navLinksFromInstalledPlugins().map((link) => ({
          id: `plugin-nav-${link.href}`,
          label: link.label,
          subtitle: link.description,
          href: link.href,
          group: "Plugins",
        })),
      );
    });
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      scheduleAfterCommit(() => setGlobalMatches([]));
      return;
    }

    let cancelled = false;
    void import("@/lib/global-search").then(({ searchGlobal }) => {
      if (cancelled) {
        return;
      }
      setGlobalMatches(
        searchGlobal(query).map((result: GlobalSearchResult) => ({
          id: result.id,
          label: result.label,
          subtitle: result.subtitle,
          href: result.href,
          group: result.group,
        })),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const favoriteHrefs = new Set(favorites);
    const continueItems: CommandItem[] = [];
    if (lastDraft) {
      continueItems.push({
        id: "resume-draft",
        label: `Resume draft · ${lastDraft.label}`,
        subtitle: lastDraft.preview,
        href: lastDraft.href,
        group: "Continue",
      });
    }
    if (lastRoute && lastRoute !== lastDraft?.href) {
      continueItems.push({
        id: "continue-route",
        label: "Continue where you left off",
        subtitle: lastRoute,
        href: lastRoute,
        group: "Continue",
      });
    }
    if (lastDraft || lastRoute) {
      continueItems.push({
        id: "dismiss-continue",
        label: "Dismiss continue",
        subtitle: "Clear resume draft and last tool",
        group: "Continue",
        action: () => {
          clearLastToolDraft();
          clearLastToolRoute();
          setLastDraft(null);
          setLastRoute(null);
        },
      });
    }
    const recentItems: CommandItem[] = recent.map((entry) => ({
      id: `recent-${entry.href}`,
      label: entry.label,
      subtitle: entry.href,
      href: entry.href,
      group: "Recent",
    }));

    const withFavFirst = [...items].sort((a, b) => {
      const aFav = a.href ? favoriteHrefs.has(a.href) : false;
      const bFav = b.href ? favoriteHrefs.has(b.href) : false;
      if (aFav === bFav) {
        return 0;
      }
      return aFav ? -1 : 1;
    });

    if (!q) {
      const seen = new Set<string>();
      return [...continueItems, ...recentItems, ...withFavFirst].filter((item) => {
        const key = item.group === "Continue" ? item.id : (item.href ?? item.id);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }
    const staticMatches = [...continueItems, ...recentItems, ...withFavFirst].filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subtitle?.toLowerCase().includes(q) ?? false),
    );
    const seen = new Set<string>();
    return [...staticMatches, ...globalMatches].filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }, [favorites, globalMatches, items, lastDraft, lastRoute, query, recent]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length, query, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setOpen((value) => {
          const next = !value;
          if (next) {
            markOnboardingDiscoverPalette();
          }
          return next;
        });
        setQuery("");
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        setQuery("");
        markOnboardingDiscoverPalette();
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function runItem(item: CommandItem) {
    if (item.action) {
      item.action();
      if (item.id !== "dismiss-continue") {
        setOpen(false);
      }
      return;
    }
    setOpen(false);
    if (item.href) {
      router.push(item.href);
    }
  }

  if (!open) {
    return (
      <KeyboardShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    );
  }

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[rgb(0_0_0_/0.55)] px-4 pt-[12vh] backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-muted)] shadow-[var(--shadow-card)]">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) =>
                filtered.length === 0 ? 0 : (index + 1) % filtered.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) =>
                filtered.length === 0
                  ? 0
                  : (index - 1 + filtered.length) % filtered.length,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              const item = filtered[activeIndex];
              if (item) {
                runItem(item);
              }
            }
          }}
          placeholder="Jump to a page, Studio/Settings tab, or search…"
          className="w-full border-b border-[var(--border-subtle)] bg-transparent px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
        />
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--text-muted)]">No matches.</li>
          ) : (
            filtered.map((item, index) => {
              const favorited = item.href ? isNavFavorite(item.href, favorites) : false;
              return (
                <li key={item.id}>
                  <div
                    data-command-index={index}
                    className={`flex w-full items-center gap-1 px-2 ${
                      index === activeIndex ? "bg-[var(--accent-muted)]" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center justify-between rounded-[var(--radius-md)] px-2 py-2.5 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runItem(item)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {favorited ? "★ " : ""}
                          {item.label}
                        </span>
                        {item.subtitle ? (
                          <span className="block truncate text-xs text-[var(--text-muted)]">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {item.group}
                      </span>
                    </button>
                    {item.href ? (
                      <button
                        type="button"
                        aria-label={favorited ? "Unpin from sidebar" : "Pin to sidebar"}
                        title={favorited ? "Unpin" : "Pin"}
                        className="shrink-0 rounded-[var(--radius-md)] px-2 py-2 text-sm text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFavorites(toggleNavFavorite(item.href!));
                        }}
                      >
                        {favorited ? "★" : "☆"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-muted)]">
          Tip: <kbd className="rounded border border-[var(--border-default)] px-1">⌘/Ctrl+K</kbd>{" "}
          · arrows + Enter · star to pin ·{" "}
          <button
            type="button"
            className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
            onClick={() => {
              setOpen(false);
              setShortcutsOpen(true);
            }}
          >
            Shortcuts
          </button>
          .{" "}
          <Link
            href="/settings"
            className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 -z-10"
        onClick={() => setOpen(false)}
      />
    </div>
    <KeyboardShortcutsHelp
      open={shortcutsOpen}
      onClose={() => setShortcutsOpen(false)}
    />
    </>
  );
}
