"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { loadToolContext, saveToolContext } from "@/lib/tool-context-memory";
import { COMFY_MODEL_IDS } from "@/lib/comfy-models/client";

export function useCachedSettings<K extends keyof ToolSettingsCache>(
  toolKey: K,
  toolDefaults: NonNullable<ToolSettingsCache[K]>,
) {
  const defaultsRef = useRef(toolDefaults);
  defaultsRef.current = toolDefaults ?? defaultsRef.current;
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [toolSettings, setToolSettings] = useState<
    NonNullable<ToolSettingsCache[K]>
  >(() => (toolDefaults ?? {}) as NonNullable<ToolSettingsCache[K]>);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const cache = loadSettingsCache();
      const memory = loadToolContext(String(toolKey));
      let nextShared = cache.shared;
      if (memory?.model || memory?.selectedWorkflowFileId) {
        nextShared = {
          ...cache.shared,
          ...(memory.model && COMFY_MODEL_IDS.has(memory.model)
            ? { model: memory.model }
            : {}),
          ...(memory.selectedWorkflowFileId
            ? { selectedWorkflowFileId: memory.selectedWorkflowFileId }
            : {}),
        };
        if (
          nextShared.model !== cache.shared.model ||
          nextShared.selectedWorkflowFileId !== cache.shared.selectedWorkflowFileId
        ) {
          saveSharedSettings(nextShared);
        }
      }
      setShared(nextShared);
      const defaults =
        defaultsRef.current ??
        ({} as NonNullable<ToolSettingsCache[K]>);
      setToolSettings(loadToolSettings(toolKey, defaults));
      setMounted(true);
    });
    // toolDefaults are module-level constants; toolKey selects the cache slice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolKey]);

  const updateShared = useCallback(
    (partial: Partial<SharedToolSettings>) => {
      setShared((previous) => {
        const next = { ...previous, ...partial };
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
      defaultsRef.current ??
      ({} as NonNullable<ToolSettingsCache[K]>),
    updateShared,
    updateToolSettings,
    setModel: (model: SharedToolSettings["model"]) => updateShared({ model }),
    setDetail: (detail: SharedToolSettings["detail"]) => updateShared({ detail }),
  };
}
