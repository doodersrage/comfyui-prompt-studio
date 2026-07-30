'use client';

import { useCallback } from 'react';
import { loadLocationBlocklist } from '@/hooks/usePromptHistory';

export function useLocationBlocklist() {
  const getBlocklist = useCallback(() => loadLocationBlocklist(), []);

  return { getBlocklist };
}
