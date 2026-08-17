'use client';

import { useEffect, useState } from 'react';
import {
  loadWorkspaceMode,
  WORKSPACE_MODE_CHANGED_EVENT,
  type WorkspaceMode,
} from '@/lib/workspace-mode';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

/** Live workspace mode for progressive disclosure in tool chrome. */
export function useWorkspaceMode(): WorkspaceMode {
  const [mode, setMode] = useState<WorkspaceMode>('simple');

  useEffect(() => {
    scheduleAfterCommit(() => {
      setMode(loadWorkspaceMode());
    });
    const sync = () => setMode(loadWorkspaceMode());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener(WORKSPACE_MODE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener(WORKSPACE_MODE_CHANGED_EVENT, sync);
    };
  }, []);

  return mode;
}
