"use client";

import { useEffect } from "react";
import { applyAppTheme } from "@/lib/theme-store";
import { applyAmbientIntensity } from "@/lib/ambient-settings";

export default function ThemeInit() {
  useEffect(() => {
    applyAppTheme();
    applyAmbientIntensity();
  }, []);

  return null;
}
