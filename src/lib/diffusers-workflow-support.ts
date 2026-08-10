import type { DiffusersClassifyResult } from './diffusers-client';

export type DiffusersSupportHint = {
  mode: 'native' | 'fallback' | 'unknown';
  label: string;
  detail: string;
};

export function formatDiffusersClassifyHint(
  result: DiffusersClassifyResult | null | undefined
): DiffusersSupportHint {
  if (!result) {
    return {
      mode: 'unknown',
      label: 'Diffusers classify unavailable',
      detail: 'Start the Diffusers engine or check DIFFUSERS_API_URL.',
    };
  }
  if (result.supported) {
    const img2img =
      typeof result.assets.init_image === 'string' && result.assets.init_image ? ' · img2img' : '';
    return {
      mode: 'native',
      label: `Native Diffusers · ${result.family}${img2img}`,
      detail: result.reason || 'Graph compiles for native execution.',
    };
  }
  const nodes =
    result.unsupportedNodes.length > 0
      ? ` Unsupported: ${result.unsupportedNodes.slice(0, 3).join(', ')}${result.unsupportedNodes.length > 3 ? '…' : ''}.`
      : '';
  return {
    mode: 'fallback',
    label: 'Comfy fallback likely',
    detail: `${result.reason || 'Workflow not natively supported.'}${nodes}`,
  };
}
