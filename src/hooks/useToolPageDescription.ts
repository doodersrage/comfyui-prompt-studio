'use client';

import { descriptionForWorkspace } from '@/lib/tool-page-chrome';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';

/** Pick full vs Simple workspace copy for ToolLayout descriptions. */
export function useToolPageDescription(full: string, simple: string): string {
  const mode = useWorkspaceMode();
  return descriptionForWorkspace(mode, full, simple);
}
