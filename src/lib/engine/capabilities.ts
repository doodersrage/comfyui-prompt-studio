import type { EngineId } from './types';

export const FAL_QUEUE_HOST = 'https://queue.fal.run';
export const REPLICATE_API_HOST = 'https://api.replicate.com';
export const OPENAI_API_HOST = 'https://api.openai.com';
export const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';
export const GROK_API_HOST = 'https://api.x.ai';

export const DEFAULT_FAL_TXT2IMG_MODEL = 'fal-ai/flux/schnell';
export const DEFAULT_FAL_IMG2IMG_MODEL = 'fal-ai/flux/dev/image-to-image';
export const DEFAULT_FAL_I2V_MODEL = 'fal-ai/kling-video/v2.1/standard/image-to-video';
export const DEFAULT_FAL_T2V_MODEL = 'fal-ai/kling-video/v2.1/standard/text-to-video';
export const DEFAULT_REPLICATE_TXT2IMG_MODEL = 'black-forest-labs/flux-schnell';
export const DEFAULT_REPLICATE_IMG2IMG_MODEL = 'black-forest-labs/flux-dev';
export const DEFAULT_OPENAI_TXT2IMG_MODEL = 'gpt-image-2';
export const DEFAULT_OPENAI_IMG2IMG_MODEL = 'gpt-image-2';
export const DEFAULT_GEMINI_TXT2IMG_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_GEMINI_IMG2IMG_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_GROK_TXT2IMG_MODEL = 'grok-imagine-image-2.0';
export const DEFAULT_GROK_IMG2IMG_MODEL = 'grok-imagine-image-2.0';

export const CLOUD_ENGINE_IDS = ['fal', 'replicate', 'openai', 'gemini', 'grok'] as const;
export type CloudEngineId = (typeof CLOUD_ENGINE_IDS)[number];

export const FAL_MODEL_PRESETS = [
  { id: 'fal-ai/flux/schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'fal-ai/flux/dev', label: 'FLUX Dev (quality txt2img)' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'FLUX Pro 1.1' },
  { id: 'fal-ai/flux/dev/image-to-image', label: 'FLUX Dev image-to-image' },
] as const;

export const FAL_I2V_MODEL_PRESETS = [
  { id: 'fal-ai/kling-video/v2.1/standard/image-to-video', label: 'Kling 2.1 image-to-video' },
  { id: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling 3.0 image-to-video' },
  { id: 'fal-ai/wan/v2.2-a14b/image-to-video', label: 'WAN 2.2 image-to-video' },
  { id: 'fal-ai/wan/v2.7/image-to-video', label: 'WAN 2.7 image-to-video' },
] as const;

export const FAL_T2V_MODEL_PRESETS = [
  { id: 'fal-ai/kling-video/v2.1/standard/text-to-video', label: 'Kling 2.1 text-to-video' },
  { id: 'fal-ai/kling-video/v3/standard/text-to-video', label: 'Kling 3.0 text-to-video' },
  { id: 'fal-ai/wan/v2.2-a14b/text-to-video', label: 'WAN 2.2 text-to-video' },
  { id: 'fal-ai/wan/v2.7/text-to-video', label: 'WAN 2.7 text-to-video' },
] as const;

export const REPLICATE_MODEL_PRESETS = [
  { id: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell (fast txt2img)' },
  { id: 'black-forest-labs/flux-dev', label: 'FLUX Dev (txt2img / img2img)' },
  { id: 'black-forest-labs/flux-1.1-pro', label: 'FLUX 1.1 Pro' },
  { id: 'stability-ai/sdxl', label: 'Stable Diffusion XL' },
] as const;

export const OPENAI_MODEL_PRESETS = [
  { id: 'gpt-image-2', label: 'GPT Image 2 (ChatGPT Images)' },
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { id: 'gpt-image-1', label: 'GPT Image 1' },
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
] as const;

export const GEMINI_MODEL_PRESETS = [
  { id: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image (Nano Banana 2)' },
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image' },
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
] as const;

export const GROK_MODEL_PRESETS = [
  { id: 'grok-imagine-image-2.0', label: 'Grok Imagine Image 2.0' },
  { id: 'grok-2-image', label: 'Grok 2 Image' },
] as const;

export type CloudSessionTokenField =
  | 'sessionFalApiKey'
  | 'sessionReplicateApiToken'
  | 'sessionOpenaiApiKey'
  | 'sessionGeminiApiKey'
  | 'sessionGrokApiKey';

export type CloudModelField =
  'falModel' | 'replicateModel' | 'openaiModel' | 'geminiModel' | 'grokModel';

export type CloudImg2ImgField =
  | 'falImg2ImgModel'
  | 'replicateImg2ImgModel'
  | 'openaiImg2ImgModel'
  | 'geminiImg2ImgModel'
  | 'grokImg2ImgModel';

export type CloudTokenBodyKey =
  'falApiKey' | 'replicateApiToken' | 'openaiApiKey' | 'geminiApiKey' | 'grokApiKey';

export type CloudEngineOption = {
  id: CloudEngineId;
  label: string;
  shortLabel: string;
  host: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  envTokenName: string;
  envTokenKeys: readonly string[];
  sessionTokenField: CloudSessionTokenField;
  modelField: CloudModelField;
  img2imgField: CloudImg2ImgField;
  tokenBodyKey: CloudTokenBodyKey;
  defaultTxt2Img: string;
  defaultImg2Img: string;
  presets: readonly { id: string; label: string }[];
};

export const CLOUD_ENGINE_OPTIONS: CloudEngineOption[] = [
  {
    id: 'fal',
    label: 'Fal (cloud txt2img)',
    shortLabel: 'Fal',
    host: FAL_QUEUE_HOST,
    tokenLabel: 'Fal API key',
    tokenPlaceholder: 'Server FAL_KEY is used when this is empty',
    envTokenName: 'FAL_KEY',
    envTokenKeys: ['FAL_KEY', 'FAL_API_KEY'],
    sessionTokenField: 'sessionFalApiKey',
    modelField: 'falModel',
    img2imgField: 'falImg2ImgModel',
    tokenBodyKey: 'falApiKey',
    defaultTxt2Img: DEFAULT_FAL_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_FAL_IMG2IMG_MODEL,
    presets: FAL_MODEL_PRESETS,
  },
  {
    id: 'replicate',
    label: 'Replicate (cloud txt2img)',
    shortLabel: 'Replicate',
    host: REPLICATE_API_HOST,
    tokenLabel: 'Replicate API token',
    tokenPlaceholder: 'Server REPLICATE_API_TOKEN is used when this is empty',
    envTokenName: 'REPLICATE_API_TOKEN',
    envTokenKeys: ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY'],
    sessionTokenField: 'sessionReplicateApiToken',
    modelField: 'replicateModel',
    img2imgField: 'replicateImg2ImgModel',
    tokenBodyKey: 'replicateApiToken',
    defaultTxt2Img: DEFAULT_REPLICATE_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_REPLICATE_IMG2IMG_MODEL,
    presets: REPLICATE_MODEL_PRESETS,
  },
  {
    id: 'openai',
    label: 'ChatGPT / OpenAI Images',
    shortLabel: 'ChatGPT',
    host: OPENAI_API_HOST,
    tokenLabel: 'OpenAI API key',
    tokenPlaceholder: 'Server OPENAI_API_KEY is used when this is empty',
    envTokenName: 'OPENAI_API_KEY',
    envTokenKeys: ['OPENAI_API_KEY'],
    sessionTokenField: 'sessionOpenaiApiKey',
    modelField: 'openaiModel',
    img2imgField: 'openaiImg2ImgModel',
    tokenBodyKey: 'openaiApiKey',
    defaultTxt2Img: DEFAULT_OPENAI_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_OPENAI_IMG2IMG_MODEL,
    presets: OPENAI_MODEL_PRESETS,
  },
  {
    id: 'gemini',
    label: 'Google Gemini (Nano Banana)',
    shortLabel: 'Gemini',
    host: GEMINI_API_HOST,
    tokenLabel: 'Gemini API key',
    tokenPlaceholder: 'Server GEMINI_API_KEY is used when this is empty',
    envTokenName: 'GEMINI_API_KEY',
    envTokenKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GEMINI_API_KEY'],
    sessionTokenField: 'sessionGeminiApiKey',
    modelField: 'geminiModel',
    img2imgField: 'geminiImg2ImgModel',
    tokenBodyKey: 'geminiApiKey',
    defaultTxt2Img: DEFAULT_GEMINI_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_GEMINI_IMG2IMG_MODEL,
    presets: GEMINI_MODEL_PRESETS,
  },
  {
    id: 'grok',
    label: 'Grok (xAI Imagine)',
    shortLabel: 'Grok',
    host: GROK_API_HOST,
    tokenLabel: 'xAI API key',
    tokenPlaceholder: 'Server XAI_API_KEY is used when this is empty',
    envTokenName: 'XAI_API_KEY',
    envTokenKeys: ['XAI_API_KEY', 'GROK_API_KEY'],
    sessionTokenField: 'sessionGrokApiKey',
    modelField: 'grokModel',
    img2imgField: 'grokImg2ImgModel',
    tokenBodyKey: 'grokApiKey',
    defaultTxt2Img: DEFAULT_GROK_TXT2IMG_MODEL,
    defaultImg2Img: DEFAULT_GROK_IMG2IMG_MODEL,
    presets: GROK_MODEL_PRESETS,
  },
];

const CLOUD_ENGINE_BY_ID = new Map(CLOUD_ENGINE_OPTIONS.map(option => [option.id, option]));

export function cloudEngineOption(id: EngineId | undefined): CloudEngineOption | undefined {
  if (!id) {
    return undefined;
  }
  return CLOUD_ENGINE_BY_ID.get(id as CloudEngineId);
}

export function parseEngineId(value: unknown): EngineId | undefined {
  if (value === 'comfyui' || value === 'diffusers') {
    return value;
  }
  if (typeof value === 'string' && CLOUD_ENGINE_BY_ID.has(value as CloudEngineId)) {
    return value as CloudEngineId;
  }
  return undefined;
}

export function normalizeEngineId(value: unknown): EngineId {
  return parseEngineId(value) ?? 'comfyui';
}

/** Cloud APIs with no Comfy graph (prompt + optional reference image). */
export function isCloudEngine(id: EngineId | undefined): id is CloudEngineId {
  return typeof id === 'string' && CLOUD_ENGINE_BY_ID.has(id as CloudEngineId);
}

/** Backends that still queue a Comfy-shaped workflow (or Diffusers classify). */
export function engineUsesComfyGraph(id: EngineId | undefined): boolean {
  return !isCloudEngine(id);
}

export function engineDisplayName(id: EngineId | undefined): string {
  if (id === 'diffusers') {
    return 'Diffusers';
  }
  return cloudEngineOption(id)?.shortLabel ?? 'ComfyUI';
}

export function cloudEngineHost(id: EngineId | undefined): string {
  return cloudEngineOption(id)?.host ?? FAL_QUEUE_HOST;
}

export function defaultCloudTxt2ImgModel(id: EngineId | undefined): string {
  return cloudEngineOption(id)?.defaultTxt2Img ?? DEFAULT_FAL_TXT2IMG_MODEL;
}

export function defaultCloudImg2ImgModel(id: EngineId | undefined): string {
  return cloudEngineOption(id)?.defaultImg2Img ?? DEFAULT_FAL_IMG2IMG_MODEL;
}

export function cloudSettingsHref(): string {
  return '/settings?tab=comfyui&section=inference-engine';
}
