'use client';

import { useEffect } from 'react';
import { registerPluginPresetCacheListeners } from '@/lib/plugin-preset-catalog';

/** Hydrates plugin preset catalogs and listens for manifest updates. */
export default function PluginRuntimeInit() {
  useEffect(() => registerPluginPresetCacheListeners(), []);
  return null;
}
