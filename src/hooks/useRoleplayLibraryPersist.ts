'use client';

import { useEffect } from 'react';
import { applyCharacterRecord, upsertCharacterFromRoleplaySession } from '@/lib/character-os';
import {
  loadSettingsCache,
  saveSharedSettings,
  type RoleplayToolCache,
} from '@/lib/settings-cache';
import { persistRoleplayLibraryFromCache } from '@/lib/roleplay-library';

type UseRoleplayLibraryPersistOptions = {
  mounted: boolean;
  toolSettings: RoleplayToolCache;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
};

export function useRoleplayLibraryPersist({
  mounted,
  toolSettings,
  updateToolSettings,
}: UseRoleplayLibraryPersistOptions) {
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      const persisted = persistRoleplayLibraryFromCache(toolSettings);
      if (!persisted) {
        return;
      }
      const character = upsertCharacterFromRoleplaySession(persisted.session);
      if (character) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecord(character),
        });
      }
      if (
        persisted.cache.activeSessionId &&
        persisted.cache.activeSessionId !== toolSettings.activeSessionId
      ) {
        updateToolSettings({ activeSessionId: persisted.cache.activeSessionId });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mounted, toolSettings, updateToolSettings]);
}
