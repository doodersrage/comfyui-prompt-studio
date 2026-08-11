import { settingsComfyUiSectionHref } from './settings-comfyui-nav';

/** Detect missing custom-node / pack failures and route the toast CTA. */
export function resolveQueueFailureHref(message: string): string | undefined {
  const text = message.trim();
  if (!text) {
    return undefined;
  }
  if (/not installed in ComfyUI/i.test(text) || /custom node pack/i.test(text)) {
    return settingsComfyUiSectionHref('workflow-map');
  }
  if (/workflow map|system workflows|no workflow/i.test(text)) {
    return settingsComfyUiSectionHref('workflow-map');
  }
  if (/ComfyUI.*(unreachable|refused|failed to fetch|ECONNREFUSED)/i.test(text)) {
    return settingsComfyUiSectionHref('connection');
  }
  return undefined;
}
