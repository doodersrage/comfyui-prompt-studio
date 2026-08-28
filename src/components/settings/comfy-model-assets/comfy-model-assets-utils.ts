import type { AssetRow } from '@/components/settings/comfy-model-assets/comfy-model-assets-types';

export function statusLabel(status: AssetRow['status']): string {
  switch (status) {
    case 'installed':
      return 'Installed';
    case 'missing':
      return 'Missing';
    case 'root-missing':
      return 'Needs COMFYUI_ROOT';
    case 'docs-only':
      return 'Manual only';
    default:
      return status;
  }
}

export function formatBytes(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return '';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
