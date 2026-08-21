'use client';

import { useEffect } from 'react';
import { applyAppTheme, subscribeSystemTheme } from '@/lib/theme-store';
import { applyAmbientIntensity } from '@/lib/ambient-settings';
import { applyCalmUi } from '@/lib/calm-settings';
import { applyUiDensity } from '@/lib/density-settings';
import { applyWorkspaceMode } from '@/lib/workspace-mode';

export default function ThemeInit() {
  useEffect(() => {
    applyAppTheme();
    applyAmbientIntensity();
    applyUiDensity();
    applyCalmUi();
    applyWorkspaceMode();

    return subscribeSystemTheme();
  }, []);

  return null;
}
