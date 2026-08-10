'use client';

import {
  descriptionForWorkspace,
  HUB_PAGE_DESCRIPTIONS,
  sectionDescriptionForWorkspace,
} from '@/lib/tool-page-chrome';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';

/** Pick full vs Simple workspace copy for ToolLayout descriptions. */
export function useToolPageDescription(full: string, simple: string): string {
  const mode = useWorkspaceMode();
  return descriptionForWorkspace(mode, full, simple);
}

/** Hub pages with canonical copy from tool-page-chrome. */
export function useHubPageDescription(hub: keyof typeof HUB_PAGE_DESCRIPTIONS): string {
  const mode = useWorkspaceMode();
  const copy = HUB_PAGE_DESCRIPTIONS[hub];
  return descriptionForWorkspace(mode, copy.full, copy.simple);
}

/** ToolSection descriptions — hidden in Simple when the setup banner is enough. */
export function useToolSectionDescription(full: string): string | undefined {
  const mode = useWorkspaceMode();
  return sectionDescriptionForWorkspace(mode, full);
}
