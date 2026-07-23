"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isBrowserStorageReady,
  whenBrowserStorageReady,
} from "@/lib/browser-storage";
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
  type SharedToolSettings,
  type ToolSettingsCache,
} from "@/lib/settings-cache";
import { loadToolContext, saveToolContext } from "@/lib/tool-context-memory";
import { COMFY_MODEL_IDS } from "@/lib/comfy-models/client";

function applyToolContext(
  shared: SharedToolSettings,
  toolKey: string,
): SharedToolSettings {
  const memory = loadToolContext(toolKey);
  if (!memory?.model && !memory?.selectedWorkflowFileId) {
    return shared;
  }
  return {
    ...shared,
    ...(memory.model && COMFY_MODEL_IDS.has(memory.model)
      ? { model: memory.model }
      : {}),
    ...(memory.selectedWorkflowFileId
      ? { selectedWorkflowFileId: memory.selectedWorkflowFileId }
      : {}),
  };
}

export function useCachedSettings<K extends keyof ToolSettingsCache>(
  toolKey: K,
  toolDefaults: NonNullable<ToolSettingsCache[K]>,
) {
  const defaultsRef = useRef(toolDefaults);
  const hydratedRef = useRef(false);
  const pendingSharedRef = useRef<Partial<SharedToolSettings> | null>(null);
  const pendingToolRef = useRef<Partial<
    NonNullable<ToolSettingsCache[K]>
  > | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [toolSettings, setToolSettings] = useState<
    NonNullable<ToolSettingsCache[K]>
  >(() => (toolDefaults ?? {}) as NonNullable<ToolSettingsCache[K]>);

  useEffect(() => {
    defaultsRef.current = toolDefaults ?? defaultsRef.current;
  }, [toolDefaults]);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      const cache = loadSettingsCache();
      let nextShared = applyToolContext(cache.shared, String(toolKey));
      if (
        nextShared.model !== cache.shared.model ||
        nextShared.selectedWorkflowFileId !== cache.shared.selectedWorkflowFileId
      ) {
        saveSharedSettings(nextShared);
      }

      const pendingShared = pendingSharedRef.current;
      pendingSharedRef.current = null;
      if (pendingShared && Object.keys(pendingShared).length > 0) {
        nextShared = { ...nextShared, ...pendingShared };
        saveSharedSettings(nextShared);
        if (
          "model" in pendingShared ||
          "selectedWorkflowFileId" in pendingShared
        ) {
          saveToolContext(String(toolKey), {
            model: nextShared.model,
            selectedWorkflowFileId: nextShared.selectedWorkflowFileId,
          });
        }
      }

      const defaults =
        defaultsRef.current ??
        ({} as NonNullable<ToolSettingsCache[K]>);
      let nextTool = loadToolSettings(toolKey, defaults);
      const pendingTool = pendingToolRef.current;
      pendingToolRef.current = null;
      if (pendingTool && Object.keys(pendingTool).length > 0) {
        nextTool = { ...nextTool, ...pendingTool } as NonNullable<
          ToolSettingsCache[K]
        >;
        saveToolSettings(toolKey, nextTool);
      }

      // Always replace React defaults with hydrated settings. Pre-hydrate edits
      // are held in pending* refs and merged above — never block hydrate.
      setShared(nextShared);
      setToolSettings(nextTool);
      hydratedRef.current = true;
      setMounted(true);
    });
    // toolDefaults are module-level constants; toolKey selects the cache slice
    return () => {
      cancelled = true;
    };
  }, [toolKey]);

  const updateShared = useCallback(
    (partial: Partial<SharedToolSettings>) => {
      // Before IndexedDB hydrate, only update React optimistically and queue the
      // patch. Persisting here would stamp DEFAULT_SHARED_SETTINGS over real data.
      if (!hydratedRef.current || !isBrowserStorageReady()) {
        pendingSharedRef.current = {
          ...(pendingSharedRef.current ?? {}),
          ...partial,
        };
        setShared((previous) => ({ ...previous, ...partial }));
        return;
      }

      setShared(() => {
        // RMW from persisted cache — not React previous — so a stale defaults
        // render cannot wipe sampler/quality/maps on the next edit.
        const next = { ...loadSettingsCache().shared, ...partial };
        saveSharedSettings(next);
        if ("model" in partial || "selectedWorkflowFileId" in partial) {
          saveToolContext(String(toolKey), {
            model: next.model,
            selectedWorkflowFileId: next.selectedWorkflowFileId,
          });
        }
        return next;
      });
    },
    [toolKey],
  );

  const updateToolSettings = useCallback(
    (partial: Partial<NonNullable<ToolSettingsCache[K]>>) => {
      if (!hydratedRef.current || !isBrowserStorageReady()) {
        pendingToolRef.current = {
          ...(pendingToolRef.current ?? {}),
          ...partial,
        };
        setToolSettings((previous) => {
          const defaults =
            defaultsRef.current ??
            ({} as NonNullable<ToolSettingsCache[K]>);
          return {
            ...(previous ?? defaults),
            ...partial,
          } as NonNullable<ToolSettingsCache[K]>;
        });
        return;
      }

      setToolSettings((previous) => {
        const defaults =
          defaultsRef.current ??
          ({} as NonNullable<ToolSettingsCache[K]>);
        const next = {
          ...(previous ?? defaults),
          ...partial,
        } as NonNullable<ToolSettingsCache[K]>;
        saveToolSettings(toolKey, next);
        return next;
      });
    },
    [toolKey],
  );

  return {
    mounted,
    shared,
    toolSettings:
      toolSettings ??
      toolDefaults ??
      ({} as NonNullable<ToolSettingsCache[K]>),
    updateShared,
    updateToolSettings,
    setModel: (model: SharedToolSettings["model"]) => updateShared({ model }),
    setDetail: (detail: SharedToolSettings["detail"]) => updateShared({ detail }),
  };
}
