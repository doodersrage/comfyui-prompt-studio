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

/** Hub page descriptions — full vs Simple workspace. */
export const HUB_PAGE_DESCRIPTIONS = {
  gallery: {
    full: 'Browse outputs, review and compare variants, run experiments, and queue follow-up work from one place.',
    simple: 'Browse and review outputs — use search and filters when you need to dig in.',
  },
  queue: {
    full: 'Pending and running jobs across gallery entries. Live ComfyUI queue stats refresh every few seconds.',
    simple: 'Active jobs at a glance — expand sections below for failed runs and recent outputs.',
  },
  dashboard: {
    full: 'Pending ComfyUI jobs, recent outputs, queue status, and your active project — without the generator UI in the way.',
    simple:
      'Queue status and recent outputs at a glance — open Generate when you are ready to create.',
  },
} as const;

/** Omit verbose ToolSection descriptions in Simple workspace. */
export function sectionDescriptionForWorkspace(
  mode: WorkspaceMode,
  full: string
): string | undefined {
  return mode === 'simple' ? undefined : full;
}
