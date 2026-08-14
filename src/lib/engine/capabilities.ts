import type { EngineId } from './types';

export const FAL_QUEUE_HOST = 'https://queue.fal.run';
export const REPLICATE_API_HOST = 'https://api.replicate.com';

export const DEFAULT_FAL_TXT2IMG_MODEL = 'fal-ai/flux/schnell';
export const DEFAULT_FAL_IMG2IMG_MODEL = 'fal-ai/flux/dev/image-to-image';
export const DEFAULT_REPLICATE_TXT2IMG_MODEL = 'black-forest-labs/flux-schnell';
export const DEFAULT_REPLICATE_IMG2IMG_MODEL = 'black-forest-labs/flux-dev';

export const CLOUD_ENGINE_IDS = ['fal', 'replicate'] as const;
export type CloudEngineId = (typeof CLOUD_ENGINE_IDS)[number];

export const FAL_MODEL_PRESETS = [
  { id: 'fal-ai/flux/schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'fal-ai/flux/dev', label: 'FLUX Dev (quality txt2img)' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX Pro 1.1' },
  { id: 'fal-ai/flux/dev/image-to-image', label: 'FLUX Dev image-to-image' },
] as const;

export const REPLICATE_MODEL_PRESETS = [
  { id: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'black-forest-labs/flux-dev', label: 'FLUX Dev (txt2img / img2img)' },
  { id: 'black-forest-labs/flux-1.1-pro', label: 'FLUX 1.1 Pro' },
  { id: 'stability-ai/sdxl', label: 'Stable Diffusion XL' },
] as const;

export const CLOUD_ENGINE_OPTIONS: Array<{
  id: CloudEngineId;
  label: string;
  host: string;
}> = [
  { id: 'fal', label: 'Fal (cloud txt2img)', host: FAL_QUEUE_HOST },
  { id: 'replicate', label: 'Replicate (cloud txt2img)', host: REPLICATE_API_HOST },
];

export function parseEngineId(value: unknown): EngineId | undefined {
  if (value === 'comfyui' || value === 'diffusers' || value === 'fal' || value === 'replicate') {
    return value;
  }
  return undefined;
}

export function normalizeEngineId(value: unknown): EngineId {
  return parseEngineId(value) ?? 'comfyui';
}

/** Cloud APIs with no Comfy graph (prompt + optional reference image). */
export function isCloudEngine(id: EngineId | undefined): id is CloudEngineId {
  return id === 'fal' || id === 'replicate';
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
  if (id === 'replicate') {
    return 'Replicate';
  }
  return 'ComfyUI';
}

export function cloudEngineHost(id: EngineId | undefined): string {
  if (id === 'replicate') {
    return REPLICATE_API_HOST;
  }
  return FAL_QUEUE_HOST;
}

export function defaultCloudTxt2ImgModel(id: EngineId | undefined): string {
  if (id === 'replicate') {
    return DEFAULT_REPLICATE_TXT2IMG_MODEL;
  }
  return DEFAULT_FAL_TXT2IMG_MODEL;
}

export function defaultCloudImg2ImgModel(id: EngineId | undefined): string {
  if (id === 'replicate') {
    return DEFAULT_REPLICATE_IMG2IMG_MODEL;
  }
  return DEFAULT_FAL_IMG2IMG_MODEL;
}

export function cloudSettingsHref(): string {
  return '/settings?tab=comfyui&section=inference-engine';
}
