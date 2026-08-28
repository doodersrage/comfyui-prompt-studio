import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { settingsTabHref } from '@/lib/settings-nav';

export const ESSENTIAL_TASKS: Array<{
  title: string;
  description: string;
  section?: ComfyUiSettingsSectionId;
  href?: string;
}> = [
  {
    title: 'Inference engine',
    description: 'ComfyUI, Diffusers, Fal, Replicate, ChatGPT, Gemini, or Grok.',
    section: 'inference-engine',
  },
  {
    title: 'Connection',
    description: 'ComfyUI URL, tokens, and save settings.',
    section: 'connection',
  },
  {
    title: 'Workflow map',
    description: 'Assign models to workflows.',
    section: 'workflow-map',
  },
  {
    title: 'Model assets',
    description: 'Download curated checkpoints and helpers.',
    section: 'model-assets',
  },
  {
    title: 'LLM',
    description: 'Models, vision tags, and API health.',
    href: settingsTabHref('llm'),
  },
  {
    title: 'Backup & data',
    description: 'Export, sync, and restore studio data.',
    href: settingsTabHref('data'),
  },
];

export { settingsComfyUiSectionHref, settingsTabHref };
