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
  if (/not installed in ComfyUI/i.test(text) || /custom node pack/i.test(text)) {
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
  if (
    /object_info unavailable|ComfyUI.*(unreachable|refused|failed to fetch|ECONNREFUSED)/i.test(
      text
    )
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
