"use client";

import { useCallback, useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
  type SharedToolSettings,
  type ToolSettingsCache,
} from "@/lib/settings-cache";

export function useCachedSettings<K extends keyof ToolSettingsCache>(
  toolKey: K,
  toolDefaults: NonNullable<ToolSettingsCache[K]>,
) {
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [toolSettings, setToolSettings] = useState(toolDefaults);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const cache = loadSettingsCache();
      setShared(cache.shared);
      setToolSettings(loadToolSettings(toolKey, toolDefaults));
      setMounted(true);
    });
    // toolDefaults are module-level constants; toolKey selects the cache slice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolKey]);

  const updateShared = useCallback((partial: Partial<SharedToolSettings>) => {
    setShared((previous) => {
      const next = { ...previous, ...partial };
      saveSharedSettings(next);
      return next;
    });
  }, []);

  const updateToolSettings = useCallback(
    (partial: Partial<NonNullable<ToolSettingsCache[K]>>) => {
      setToolSettings((previous) => {
        const next = { ...previous, ...partial } as NonNullable<
          ToolSettingsCache[K]
        >;
        saveToolSettings(toolKey, next);
        return next;
      });
    },
    [toolKey],
  );

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    setModel: (model: SharedToolSettings["model"]) => updateShared({ model }),
    setDetail: (detail: SharedToolSettings["detail"]) => updateShared({ detail }),
  };
}
