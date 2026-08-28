import { settingsComfyUiSectionHref } from './settings-comfyui-nav';
import { settingsTabHref } from './settings-nav';
import type { WorkflowPreflightIssue } from './workflow-preflight-core';

export type QueueFailurePlaybook = {
  message: string;
  href?: string;
};

/** Detect missing custom-node / pack failures and route the toast CTA. */
export function resolveQueueFailureHref(message: string): string | undefined {
  const text = message.trim();
  if (!text) {
    return undefined;
  }
  if (
    /diffusers/i.test(text) &&
    /(failed|unsupported|unavailable|refused|ECONNREFUSED|timeout)/i.test(text)
  ) {
    return settingsComfyUiSectionHref('inference-engine');
  }
  if (
    /fal|replicate|openai|gemini|grok|cloud engine/i.test(text) &&
    /(fail|unauthorized|api key|unknown|refused|timeout)/i.test(text)
  ) {
    return settingsComfyUiSectionHref('inference-engine');
  }
  if (
    /loadimage|identity lock|ip-adapter|instantid|pulid/i.test(text) &&
    /(not found|missing|invalid|does not exist|failed)/i.test(text)
  ) {
    return settingsComfyUiSectionHref('connection');
  }
  if (/inpaint mask|draw or upload.*mask|mask.*before queue/i.test(text)) {
    return '/inpaint';
  }
  if (/batch.*(fail|partial)|partial.*batch|\d+\s*failed/i.test(text)) {
    return '/queue';
  }
  if (
    /not installed in ComfyUI/i.test(text) ||
    /custom node pack/i.test(text) ||
    /unknown node type|missing node type|node type .* not found/i.test(text) ||
    /object_info.*(missing|unknown|not found)/i.test(text)
  ) {
    return settingsComfyUiSectionHref('workflow-map');
  }
  if (/LoRA|lora stack|session LoRA/i.test(text)) {
    return settingsComfyUiSectionHref('lora-library');
  }
  if (/checkpoint|VAE|loader filename|UpscaleModel|refiner/i.test(text)) {
    return settingsComfyUiSectionHref('model-assets');
  }
  if (/placeholder|{{|}}|token/i.test(text) && /missing|unresolved|empty/i.test(text)) {
    return settingsComfyUiSectionHref('workflow-map');
  }
  if (/workflow map|system workflows|no workflow/i.test(text)) {
    return settingsComfyUiSectionHref('workflow-map');
  }
  if (/CUDA out of memory|out of memory|OOM|vram/i.test(text)) {
    return settingsComfyUiSectionHref('vram-guard');
  }
  if (
    /timed out waiting for ComfyUI|claim orphans|import history|waiting for output files|still processing/i.test(
      text
    )
  ) {
    return '/queue';
  }
  if (
    /host did not answer in time|could not read object_info|still booting|half-?healed|heal failed/i.test(
      text
    )
  ) {
    return settingsTabHref('overview');
  }
  if (
    /object_info unavailable|ComfyUI.*(unreachable|refused|failed to fetch|ECONNREFUSED)/i.test(
      text
    ) ||
    /401|403|unauthorized|authentication/i.test(text)
  ) {
    return settingsComfyUiSectionHref('connection');
  }
  if (/browser storage|IndexedDB|quota/i.test(text)) {
    return settingsTabHref('data');
  }
  return undefined;
}

/** Prefer structured issue hrefs; fall back to message heuristics. */
export function resolveQueueFailurePlaybook(
  issues: WorkflowPreflightIssue[] | undefined,
  fallbackMessage?: string
): QueueFailurePlaybook {
  const errors = (issues ?? []).filter(issue => issue.severity === 'error');
  const withHref = errors.find(issue => issue.href?.trim());
  if (withHref) {
    return {
      message: errors.map(issue => issue.message).join(' · ') || withHref.message,
      href: withHref.href,
    };
  }
  const message =
    errors.map(issue => issue.message).join(' · ') ||
    fallbackMessage?.trim() ||
    'Workflow pre-flight failed.';
  return {
    message,
    href: resolveQueueFailureHref(message),
  };
}
