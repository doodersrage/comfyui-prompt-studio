'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import CommandPalettePanel from '@/components/command-palette/CommandPalettePanel';
import {
  useCommandPaletteCatalog,
  useCommandPaletteGlobalSearch,
  useCommandPaletteOpenState,
  useCommandPalettePluginNav,
} from '@/components/command-palette/useCommandPaletteData';
import { useCommandPaletteSelection } from '@/components/command-palette/useCommandPaletteSelection';
import {
  createCommandPaletteInputKeyDown,
  useCommandPaletteActiveIndexReset,
  useCommandPaletteGlobalShortcut,
  useCommandPaletteScrollActiveItem,
} from '@/components/command-palette/useCommandPaletteKeyboard';

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const rawAuth = useAuth();
  const isNullContext = !rawAuth;

  const { allowedFeatures, authEnabled, user, loading } = rawAuth ?? {
    loading: true,
    authEnabled: false,
    user: null,
    allowedFeatures: [],
    impersonating: false,
    refresh: async () => {},
    logout: async () => {},
    isAdmin: false,
  };
  const guestShell = authEnabled && !user;
  const navReady = !loading && (!authEnabled || Boolean(user));

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const nsfwGeneratorEnabled = useNsfwGeneratorEnabled();

  const openShortcuts = useCallback(() => {
    setOpen(false);
    setShortcutsOpen(true);
  }, []);

  const { catalog, setPluginNavItems } = useCommandPaletteCatalog({
    pathname,
    nsfwGeneratorEnabled,
    onOpenShortcuts: openShortcuts,
  });
  const openState = useCommandPaletteOpenState(open);
  useCommandPalettePluginNav(open, setPluginNavItems);
  const globalMatches = useCommandPaletteGlobalSearch(query);

  const { filtered, runItem } = useCommandPaletteSelection({
    isNullContext,
    catalog,
    query,
    pathname,
    allowedFeatures,
    guestShell,
    globalMatches,
    openState,
    router,
    setOpen,
  });

  useCommandPaletteGlobalShortcut(setOpen, setQuery);
  useCommandPaletteActiveIndexReset(open, query, filtered.length, setActiveIndex);
  useCommandPaletteScrollActiveItem(open, activeIndex, listRef);

  const onInputKeyDown = useMemo(
    () =>
      createCommandPaletteInputKeyDown({
        filtered,
        activeIndex,
        setActiveIndex,
        onRunItem: runItem,
      }),
    [activeIndex, filtered, runItem]
  );

  if (!open || isNullContext) {
    return <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />;
  }

  return (
    <>
      <CommandPalettePanel
        query={query}
        filtered={filtered}
        activeIndex={activeIndex}
        favorites={openState.favorites}
        navReady={navReady}
        listRef={listRef}
        onQueryChange={setQuery}
        onInputKeyDown={onInputKeyDown}
        onSetActiveIndex={setActiveIndex}
        onRunItem={runItem}
        onSetFavorites={openState.setFavorites}
        onClose={() => setOpen(false)}
        onOpenShortcuts={openShortcuts}
      />
      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
