import type { WorkspaceMode } from './workspace-mode';

/** Shared ToolLayout sidebar copy — matches Generate simplified chrome. */
export const TOOL_SIDEBAR_TITLE = 'Settings';

export const TOOL_SIDEBAR_DESCRIPTION =
  'Model and detail for this run. Queue quality and LoRA live under Advanced.';

/** Canonical setup banner labels (align with nav catalog where possible). */
export const TOOL_SETUP_LABELS = {
  generate: 'Generate',
  format: 'Format',
  character: 'Character',
  background: 'Background',
  pet: 'Pet',
  fantasy: 'Fantasy',
  refine: 'Refine',
  compose: 'Compose',
  inpaint: 'Inpaint',
  outpaint: 'Outpaint',
  controlnet: 'ControlNet',
  negative: 'Negative',
  imagePrompt: 'Image → Prompt',
  video: 'Video',
  audio: 'Audio',
  mesh: 'Mesh',
  lint: 'Lint',
  promptEditor: 'Prompt Editor',
  topics: 'Topics',
  variations: 'Variations',
  gallery: 'Gallery',
  queue: 'Queue',
  workflowEditor: 'Workflow editor',
} as const;

/** ToolLayout width rules. */
export const TOOL_PAGE_WIDTH = {
  tool: 'default',
  hubWide: 'wide',
  pluginDetail: 'full',
} as const;

export function descriptionForWorkspace(mode: WorkspaceMode, full: string, simple: string): string {
  return mode === 'simple' ? simple : full;
}
