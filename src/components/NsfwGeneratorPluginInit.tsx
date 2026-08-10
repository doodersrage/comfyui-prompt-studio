'use client';

import { useEffect } from 'react';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import { fetchNsfwGeneratorEnabled } from '@/lib/nsfw-generator-nav';
import { NSFW_GENERATOR_MANIFEST, NSFW_GENERATOR_PLUGIN_ID } from '@/lib/nsfw-generator-plugin';
import { removeInstalledPlugin, upsertInstalledPlugin } from '@/lib/plugin-manifest';

/** Auto-install/remove the env-gated adult generator plugin manifest. */
export default function NsfwGeneratorPluginInit() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await whenBrowserStorageReady();
      if (cancelled) {
        return;
      }
      const enabled = await fetchNsfwGeneratorEnabled();
      if (cancelled) {
        return;
      }
      if (enabled) {
        upsertInstalledPlugin(NSFW_GENERATOR_MANIFEST);
        return;
      }
      removeInstalledPlugin(NSFW_GENERATOR_PLUGIN_ID);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
