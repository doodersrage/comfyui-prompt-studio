'use client';

import { useEffect, useState } from 'react';
import { fetchNsfwGeneratorEnabled } from '@/lib/nsfw-generator-nav';
import { isNsfwGeneratorEnabledClient } from '@/lib/nsfw-generator-env';

/** Resolves env-gated adult generator visibility from client env or /api/health. */
export function useNsfwGeneratorEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => isNsfwGeneratorEnabledClient());

  useEffect(() => {
    if (isNsfwGeneratorEnabledClient()) {
      return;
    }

    let cancelled = false;
    void fetchNsfwGeneratorEnabled().then(next => {
      if (!cancelled) {
        setEnabled(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
