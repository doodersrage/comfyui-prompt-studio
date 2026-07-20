"use client";

import { loadSettingsCache } from "./settings-cache";
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from "./render-realism";

export function loadRenderRealismMode(): RenderRealismMode {
  if (typeof window === "undefined") {
    return DEFAULT_RENDER_REALISM_MODE;
  }

  return normalizeRenderRealismMode(loadSettingsCache().shared.renderRealismMode);
}
