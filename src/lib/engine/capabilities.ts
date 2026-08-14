import type { EngineId } from './types';

export const FAL_QUEUE_HOST = 'https://queue.fal.run';

export const DEFAULT_FAL_TXT2IMG_MODEL = 'fal-ai/flux/schnell';
export const DEFAULT_FAL_IMG2IMG_MODEL = 'fal-ai/flux/dev/image-to-image';

export const FAL_MODEL_PRESETS = [
  { id: 'fal-ai/flux/schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'fal-ai/flux/dev', label: 'FLUX Dev (quality txt2img)' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX Pro 1.1' },
  { id: 'fal-ai/flux/dev/image-to-image', label: 'FLUX Dev image-to-image' },
] as const;

export function parseEngineId(value: unknown): EngineId | undefined {
  if (value === 'comfyui' || value === 'diffusers' || value === 'fal') {
    return value;
  }
  return undefined;
}

export function normalizeEngineId(value: unknown): EngineId {
  return parseEngineId(value) ?? 'comfyui';
}

/** Cloud APIs with no Comfy graph (prompt + optional reference image). */
export function isCloudEngine(id: EngineId | undefined): boolean {
  return id === 'fal';
}

/** Backends that still queue a Comfy-shaped workflow (or Diffusers classify). */
export function engineUsesComfyGraph(id: EngineId | undefined): boolean {
  return !isCloudEngine(id);
}

export function engineDisplayName(id: EngineId | undefined): string {
  if (id === 'diffusers') {
    return 'Diffusers';
  }
  if (id === 'fal') {
    return 'Fal';
  }
  return 'ComfyUI';
}
