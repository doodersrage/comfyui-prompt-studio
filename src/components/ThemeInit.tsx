"use client";

import { useEffect } from "react";
import { subscribeSystemTheme } from "@/lib/theme-store";
import { applyAmbientIntensity } from "@/lib/ambient-settings";
import { applyUiDensity } from "@/lib/density-settings";

export default function ThemeInit() {
  useEffect(() => {
    applyAmbientIntensity();
    applyUiDensity();
    return subscribeSystemTheme();
  }, []);

  return null;
}
