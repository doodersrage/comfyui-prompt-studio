'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { featureForPath, type AppFeatureId } from '@/lib/auth/features';
import {
  APP_NAV_GROUPS,
  APP_NAV_PROFILE_LINK,
  APP_NAV_SETTINGS_LINK,
  flattenAppNavLinks,
} from '@/lib/app-nav-catalog';
import { loadWorkspaceMode, navGroupsForWorkspaceMode } from '@/lib/workspace-mode';
import { SETTINGS_TABS, settingsTabHref, SIMPLE_SETTINGS_TAB_IDS } from '@/lib/settings-nav';
import { studioTabHref, studioTabsForWorkspaceMode } from '@/lib/studio-nav';
import { isNavFavorite, loadNavFavorites, toggleNavFavorite } from '@/lib/nav-favorites';
import { loadRecentDestinations, type RecentDestination } from '@/lib/recent-destinations';
import { clearLastToolRoute, loadLastToolRoute } from '@/lib/last-tool-route';
import {
  clearLastToolDraft,
  loadLastToolDraft,
  type ToolDraftSummary,
} from '@/lib/tool-draft-memory';
import type { GlobalSearchResult } from '@/lib/global-search';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { NSFW_GENERATOR_NAV_LINK } from '@/lib/nsfw-generator-nav';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import BrandBars from '@/components/BrandBars';
import BrandMark from '@/components/BrandMark';
import BrandStudioIllustration from '@/components/BrandStudioIllustration';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import { markOnboardingDiscoverPalette } from '@/lib/onboarding-hooks';
import type { SessionRecipe } from '@/lib/session-recipes';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';

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
    id: 'sync-now',
    label: 'Sync storage now',
    action: () => void import('@/lib/auto-storage-sync').then(m => m.autoPushStorageDebounced()),
    group: 'Actions',
  },
  {
    id: 'save-session-recipe',
    label: 'Save session snapshot',
    subtitle: 'Model, quality, LoRAs, sampler — restore anytime',
    action: () => {
      void import('@/lib/session-recipes').then(async m => {
        const { loadSettingsCache } = await import('@/lib/settings-cache');
        const shared = loadSettingsCache().shared;
        const recipe = m.buildSessionRecipeFromShared({ shared });
        m.pushSessionRecipe(recipe);
      });
    },
    group: 'Actions',
  },
  {
    id: 'restore-session-recipe',
    label: 'Restore latest session snapshot',
    subtitle: 'Applies the most recent Save session snapshot',
    action: () => {
      void import('@/lib/session-recipes').then(async m => {
        const { loadSettingsCache, saveSharedSettings } = await import('@/lib/settings-cache');
        const latest = m.loadSessionRecipes()[0];
        if (!latest) {
          return;
        }
        const next = m.applySessionRecipeShared(loadSettingsCache().shared, latest);
        saveSharedSettings(next);
        window.location.reload();
      });
    },
    group: 'Actions',
  },
  {
    id: 'review-gallery',
    label: 'Open gallery review',
    href: '/gallery?review=1',
    group: 'Actions',
  },
  {
    id: 'reload',
    label: 'Reload page',
    action: () => window.location.reload(),
    group: 'Actions',
  },
  {
    id: 'upload-gallery',
    label: 'Upload images to gallery',
    subtitle: 'Add stills from disk',
    href: '/gallery?upload=1',
    group: 'Actions',
  },
  {
    id: 'report-bug',
    label: 'Report a bug',
    subtitle: 'Open a GitHub issue',
    action: () => {
      void import('@/lib/project-links').then(m => m.openGitHubBugReport());
    },
    group: 'Actions',
  },
];

function isCommandItemAllowed(
  item: CommandItem,
  allowedFeatures: AppFeatureId[] | 'all',
  guestShell: boolean
): boolean {
  if (
    item.id === 'keyboard-shortcuts' ||
    item.id === 'reload' ||
    item.id === 'dismiss-continue' ||
    item.id === 'report-bug'
  ) {
    return true;
  }
  if (guestShell) {
    if (item.href) {
      const path = item.href.split('?')[0] ?? item.href;
      return canAccessNavFeature(allowedFeatures, featureForPath(path));
    }
    return false;
  }
  if (!item.href) {
    return true;
  }
  const path = item.href.split('?')[0] ?? item.href;
  return canAccessNavFeature(allowedFeatures, featureForPath(path));
}

function buildNavItems(): CommandItem[] {
  const mode = loadWorkspaceMode();
  const groups = navGroupsForWorkspaceMode(mode, APP_NAV_GROUPS);
  const nav = flattenAppNavLinks(groups).map(link => ({
    id: `nav-${link.href}`,
    label: link.label,
    subtitle: link.description,
    href: link.href,
    group: 'Navigate',
  }));
  const settingsTabIds =
    mode === 'simple' ? SIMPLE_SETTINGS_TAB_IDS : SETTINGS_TABS.map(tab => tab.id);
  const settingsTabs = settingsTabIds
    .map(id => SETTINGS_TABS.find(tab => tab.id === id))
    .filter((tab): tab is (typeof SETTINGS_TABS)[number] => Boolean(tab))
    .map(tab => ({
      id: `settings-${tab.id}`,
      label: `Settings · ${tab.label}`,
      subtitle: tab.description,
      href: settingsTabHref(tab.id),
      group: 'Settings',
    }));
  const studioTabs = studioTabsForWorkspaceMode(mode).map(tab => ({
    id: `studio-${tab.id}`,
    label: `Studio · ${tab.label}`,
    subtitle: tab.description,
    href: studioTabHref(tab.id),
    group: 'Studio',
  }));
  return [
    ...nav,
    {
      id: 'nav-settings',
      label: APP_NAV_SETTINGS_LINK.label,
      subtitle: APP_NAV_SETTINGS_LINK.description,
      href: APP_NAV_SETTINGS_LINK.href,
      group: 'Navigate',
    },
    {
      id: 'nav-profile',
      label: APP_NAV_PROFILE_LINK.label,
      subtitle: APP_NAV_PROFILE_LINK.description,
      href: APP_NAV_PROFILE_LINK.href,
      group: 'Navigate',
    },
    ...settingsTabs,
    ...studioTabs,
    ...ACTION_ITEMS,
  ];
}

export default function CommandPalette() {
  const router = useRouter();

  // Defer null-check to after all hooks so hook-call order stays stable.
  const rawAuth = useAuth();
  const isNullContext = !rawAuth;

  const { allowedFeatures, authEnabled, user } = rawAuth ?? {
    loading: true,
    authEnabled: false,
    user: null,
    allowedFeatures: [] as AppFeatureId[],
    impersonating: false,
    refresh: async () => {},
    logout: async () => {},
    isAdmin: false,
  };
  const guestShell = authEnabled && !user;
  const navReady = !rawAuth?.loading && (!authEnabled || Boolean(user));

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentDestination[]>([]);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<ToolDraftSummary | null>(null);
  const [lastLook, setLastLook] = useState<SessionRecipe | null>(null);
  const [keeperStack, setKeeperStack] = useState<ComfyGalleryEntry | null>(null);
  const [globalMatches, setGlobalMatches] = useState<CommandItem[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pluginNavItems, setPluginNavItems] = useState<CommandItem[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);
  const nsfwGeneratorEnabled = useNsfwGeneratorEnabled();

  const catalog = useMemo(() => {
    const base = buildNavItems();
    const existing = new Set(base.map(item => item.href).filter(Boolean));
    const pluginExtras = pluginNavItems.filter(item => item.href && !existing.has(item.href));
    const envGatedExtras =
      nsfwGeneratorEnabled && !existing.has(NSFW_GENERATOR_NAV_LINK.href)
        ? [
            {
              id: 'plugin-nav-nsfw-generator',
              label: NSFW_GENERATOR_NAV_LINK.label,
              subtitle: NSFW_GENERATOR_NAV_LINK.description,
              href: NSFW_GENERATOR_NAV_LINK.href,
              group: 'Plugins',
            } satisfies CommandItem,
          ]
        : [];
    return [
      ...base,
      ...pluginExtras,
      ...envGatedExtras,
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts',
        subtitle: 'Cheat sheet · palette also lists Resume draft & Continue',
        group: 'Actions',
        action: () => {
          setOpen(false);
          setShortcutsOpen(true);
        },
      } satisfies CommandItem,
    ];
  }, [pluginNavItems, nsfwGeneratorEnabled]);

  const items = useMemo(
    () =>
      isNullContext
        ? []
        : catalog.filter(item => isCommandItemAllowed(item, allowedFeatures, guestShell)),
    [isNullContext, allowedFeatures, catalog, guestShell]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    scheduleAfterCommit(() => {
      setFavorites(loadNavFavorites());
      setRecent(loadRecentDestinations());
      setLastRoute(loadLastToolRoute());
      setLastDraft(loadLastToolDraft());
    });
    void import('@/lib/session-recipes').then(({ latestGenerateLookRecipe }) => {
      setLastLook(latestGenerateLookRecipe());
    });
    void import('@/lib/gallery-stack-restore').then(async ({ pickKeeperStackEntry }) => {
      const { loadComfyGallery } = await import('@/lib/comfyui-gallery');
      setKeeperStack(pickKeeperStackEntry(loadComfyGallery()));
    });
    void import('@/lib/plugin-nav-links').then(({ resolveAllPluginNavLinks }) => {
      setPluginNavItems(
        resolveAllPluginNavLinks().map(link => ({
          id: `plugin-nav-${link.href}`,
          label: link.label,
          subtitle: link.description,
          href: link.href,
          group: 'Plugins',
        }))
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
    void import('@/lib/global-search').then(({ searchGlobal }) => {
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
        }))
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
        id: 'resume-draft',
        label: `Resume draft · ${lastDraft.label}`,
        subtitle: lastDraft.preview,
        href: lastDraft.href,
        group: 'Continue',
      });
    }
    if (lastRoute && lastRoute !== lastDraft?.href) {
      continueItems.push({
        id: 'continue-route',
        label: 'Continue where you left off',
        subtitle: lastRoute,
        href: lastRoute,
        group: 'Continue',
      });
    }
    if (lastLook) {
      continueItems.push({
        id: 'apply-last-look',
        label: `Apply last look · ${lastLook.label}`,
        subtitle: 'Model, LoRAs, embeddings, identity, quality',
        group: 'Continue',
        action: () => {
          void import('@/lib/session-recipes').then(async m => {
            const { loadSettingsCache, saveSharedSettings } = await import('@/lib/settings-cache');
            const recipe = m.latestGenerateLookRecipe();
            if (!recipe) {
              return;
            }
            saveSharedSettings(m.applySessionRecipeShared(loadSettingsCache().shared, recipe), {
              notify: true,
            });
            const { galleryToolHref } = await import('@/lib/gallery-tool-href');
            router.push(galleryToolHref(recipe.toolId));
          });
        },
      });
    }
    if (keeperStack) {
      continueItems.push({
        id: 'restore-keeper-stack',
        label: `Restore keeper stack · ${keeperStack.model ?? 'session'}`,
        subtitle: keeperStack.reviewRating
          ? `${keeperStack.reviewRating}★ · ${keeperStack.tool ?? 'generate'}`
          : (keeperStack.tool ?? 'generate'),
        group: 'Continue',
        action: () => {
          const entry = keeperStack;
          void import('@/lib/gallery-stack-restore').then(
            async ({ applyGalleryStackToSession }) => {
              applyGalleryStackToSession(entry);
              const { galleryToolHref } = await import('@/lib/gallery-tool-href');
              router.push(galleryToolHref(entry.tool));
            }
          );
        },
      });
    }
    if (lastDraft || lastRoute) {
      continueItems.push({
        id: 'dismiss-continue',
        label: 'Dismiss continue',
        subtitle: 'Clear resume draft and last tool',
        group: 'Continue',
        action: () => {
          clearLastToolDraft();
          clearLastToolRoute();
          setLastDraft(null);
          setLastRoute(null);
        },
      });
    }
    const recentItems: CommandItem[] = recent.map(entry => ({
      id: `recent-${entry.href}`,
      label: entry.label,
      subtitle: entry.href,
      href: entry.href,
      group: 'Recent',
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
      return [...continueItems, ...recentItems, ...withFavFirst]
        .filter(item => isCommandItemAllowed(item, allowedFeatures, guestShell))
        .filter(item => {
          const key = item.group === 'Continue' ? item.id : (item.href ?? item.id);
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
    }
    const staticMatches = [...continueItems, ...recentItems, ...withFavFirst]
      .filter(item => isCommandItemAllowed(item, allowedFeatures, guestShell))
      .filter(
        item =>
          item.label.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          (item.subtitle?.toLowerCase().includes(q) ?? false)
      );
    const seen = new Set<string>();
    return [...staticMatches, ...globalMatches]
      .filter(item => isCommandItemAllowed(item, allowedFeatures, guestShell))
      .filter(item => {
        if (seen.has(item.id)) {
          return false;
        }
        seen.add(item.id);
        return true;
      });
  }, [
    allowedFeatures,
    favorites,
    globalMatches,
    guestShell,
    items,
    keeperStack,
    lastDraft,
    lastLook,
    lastRoute,
    query,
    recent,
    router,
  ]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setActiveIndex(0);
    });
  }, [filtered.length, query, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.shiftKey) {
        event.preventDefault();
        setOpen(value => {
          const next = !value;
          if (next) {
            markOnboardingDiscoverPalette();
          }
          return next;
        });
        setQuery('');
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        setQuery('');
        markOnboardingDiscoverPalette();
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function runItem(item: CommandItem) {
    if (item.action) {
      item.action();
      if (item.id !== 'dismiss-continue') {
        setOpen(false);
      }
      return;
    }
    setOpen(false);
    if (item.href) {
      router.push(item.href);
    }
  }

  if (!open || isNullContext) {
    return <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />;
  }

  return (
    <>
      <div className="ui-command-overlay fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[max(4.5rem,10vh)] sm:pt-[12vh]">
        <div
          className="ui-command-panel relative z-10 w-full max-w-xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
            <BrandMark size={28} />
            <div className="min-w-0 flex-1">
              <p className="type-brand type-heading tracking-tight text-[var(--text-primary)]">
                Prompt Studio
              </p>
              <p className="ui-meta flex items-center gap-1.5">
                <BrandBars />
                Jump anywhere
              </p>
            </div>
            <kbd className="ui-kbd shrink-0">esc</kbd>
          </div>
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(index =>
                  filtered.length === 0 ? 0 : (index + 1) % filtered.length
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(index =>
                  filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const item = filtered[activeIndex];
                if (item) {
                  runItem(item);
                }
              }
            }}
            placeholder={
              loadWorkspaceMode() === 'simple'
                ? 'Jump to a tool, Studio tab, or search…'
                : 'Jump to a page, Studio/Settings tab, or search…'
            }
            className="w-full border-b border-[var(--border-subtle)] bg-transparent px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
          />
          <ul ref={listRef} className="ui-scroll-region max-h-[50vh] overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center">
                <BrandStudioIllustration size={72} className="mx-auto mb-3 opacity-80" />
                <p className="text-sm text-[var(--text-muted)]">No matches.</p>
              </li>
            ) : (
              filtered.map((item, index) => {
                const favorited = item.href ? isNavFavorite(item.href, favorites) : false;
                return (
                  <li key={item.id}>
                    <div
                      data-command-index={index}
                      data-active={index === activeIndex ? 'true' : 'false'}
                      className="ui-command-item flex w-full items-center gap-1 px-2"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between rounded-[var(--radius-md)] px-2 py-2.5 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => runItem(item)}
                      >
                        <span className="min-w-0">
                          <span className="ui-command-item-label block truncate font-medium">
                            {favorited ? '★ ' : ''}
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
                          aria-label={favorited ? 'Unpin from sidebar' : 'Pin to sidebar'}
                          title={favorited ? 'Unpin' : 'Pin'}
                          className="shrink-0 rounded-[var(--radius-md)] px-2 py-2 text-sm text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                          onClick={event => {
                            event.stopPropagation();
                            setFavorites(toggleNavFavorite(item.href!));
                          }}
                        >
                          {favorited ? '★' : '☆'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
            Tip: <kbd className="ui-kbd">⌘/Ctrl+K</kbd> · arrows + Enter · star to pin ·{' '}
            <button
              type="button"
              className="ui-text-link"
              onClick={() => {
                setOpen(false);
                setShortcutsOpen(true);
              }}
            >
              Shortcuts
            </button>
            {navReady ? (
              <>
                .{' '}
                <Link href="/settings" className="ui-text-link" onClick={() => setOpen(false)}>
                  Settings
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close command palette"
          className="absolute inset-0 z-0"
          onClick={() => setOpen(false)}
        />
      </div>
      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
