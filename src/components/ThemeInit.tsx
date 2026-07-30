"use client";

import { useEffect } from "react";
import {
  applyAppTheme,
  subscribeSystemTheme,
} from "@/lib/theme-store";
import { applyAmbientIntensity } from "@/lib/ambient-settings";
import { applyUiDensity } from "@/lib/density-settings";

export default function ThemeInit() {
  useEffect(() => {
    // Apply initial theme, ambient, and density values immediately
    applyAppTheme();
    applyAmbientIntensity();
    applyUiDensity();

    // Subscribe to system theme changes when in auto mode
    return subscribeSystemTheme();
  }, []);

  return null;
}
