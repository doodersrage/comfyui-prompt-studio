"use client";

import { useEffect } from "react";
import { subscribeSystemTheme } from "@/lib/theme-store";
import { applyAmbientIntensity } from "@/lib/ambient-settings";
import { applyUiDensity } from "@/lib/density-settings";
import { applyWorkspaceMode } from "@/lib/workspace-mode";

export default function ThemeInit() {
  useEffect(() => {
    applyAmbientIntensity();
    applyUiDensity();
    applyWorkspaceMode();
    return subscribeSystemTheme();
  }, []);

  return null;
}
