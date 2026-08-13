import { getComfyUiBaseUrl } from './comfyui-client';
import type { ComfyUiRuntimeConfig } from './comfyui-config';

export const COMFY_MODEL_FOLDERS = [
  'loras',
  'checkpoints',
  'vae',
  'unet',
  'diffusion_models',
  'clip',
  'clip_vision',
  'controlnet',
  'upscale_models',
  'embeddings',
  'hypernetworks',
  'text_encoders',
] as const;

export type ComfyModelFolder = (typeof COMFY_MODEL_FOLDERS)[number];

const FOLDER_SET = new Set<string>(COMFY_MODEL_FOLDERS);

export function isComfyModelFolder(value: string): value is ComfyModelFolder {
  return FOLDER_SET.has(value);
}

function readFilenameList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
    ),
  ];
}

/** Live folder listing from ComfyUI `GET /models/{folder}` (cheaper than object_info). */
export async function fetchComfyModelFilenames(
  folder: ComfyModelFolder,
  runtime?: ComfyUiRuntimeConfig
): Promise<string[] | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(folder)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) {
      return null;
    }
    return readFilenameList(await response.json());
  } catch {
    return null;
  }
}
