"use client";

import { useEffect } from "react";
import { applyAppTheme } from "@/lib/theme-store";
import { applyAmbientIntensity } from "@/lib/ambient-settings";
import { applyUiDensity } from "@/lib/density-settings";

export default function ThemeInit() {
  useEffect(() => {
    applyAppTheme();
    applyAmbientIntensity();
    applyUiDensity();
  }, []);

  return null;
}
