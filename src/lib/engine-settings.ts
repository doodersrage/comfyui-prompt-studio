'use client';

import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import type { EngineId } from './engine/types';
import {
  CLOUD_ENGINE_IDS,
  CLOUD_ENGINE_OPTIONS,
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  cloudEngineHost,
  cloudEngineOption,
  defaultCloudImg2ImgModel,
  defaultCloudTxt2ImgModel,
  isCloudEngine,
  normalizeEngineId,
  type CloudEngineId,
} from './engine/capabilities';
import { DEFAULT_DIFFUSERS_API_URL } from './diffusers-client';
import {
  inferVideoClipMode,
  resolveFalVideoModel,
  resolveReplicateVideoModel,
  type VideoClipMode,
} from './video-clip-mode';
import { DEFAULT_GEMINI_VIDEO_MODEL, DEFAULT_GROK_VIDEO_MODEL } from './cloud-video-models';

export type EngineSettings = {
  engine: EngineId;
  diffusersApiUrl: string;
  /** Spawn local Diffusers when health fails (default true). */
  diffusersAutoStart: boolean;
  falModel: string;
  falImg2ImgModel: string;
  falI2vModel: string;
  falT2vModel: string;
  falExtendModel: string;
  replicateModel: string;
  replicateImg2ImgModel: string;
  replicateI2vModel: string;
  replicateT2vModel: string;
  openaiModel: string;
  openaiImg2ImgModel: string;
  geminiModel: string;
  geminiImg2ImgModel: string;
  grokModel: string;
  grokImg2ImgModel: string;
};

function envDefaultEngine(): EngineId {
  if (typeof process !== 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_PROMPT_ENGINE?.trim().toLowerCase() ||
      process.env.PROMPT_ENGINE?.trim().toLowerCase();
    if (raw === 'diffusers' || (CLOUD_ENGINE_IDS as readonly string[]).includes(raw ?? '')) {
      return raw as EngineId;
    }
  }
  return 'comfyui';
}

function envDefaultDiffusersUrl(): string {
  if (typeof process !== 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_DIFFUSERS_API_URL?.trim() || process.env.DIFFUSERS_API_URL?.trim();
    if (raw) {
      return raw;
    }
  }
  return DEFAULT_DIFFUSERS_API_URL;
}

function envOr(keys: string[], fallback: string): string {
  if (typeof process !== 'undefined') {
    for (const key of keys) {
      const raw = process.env[key]?.trim();
      if (raw) {
        return raw;
      }
    }
  }
  return fallback;
}

function envCloudTxt2Img(id: CloudEngineId): string {
  const option = cloudEngineOption(id)!;
  const prefix = id.toUpperCase();
  return envOr([`NEXT_PUBLIC_${prefix}_MODEL`, `${prefix}_MODEL`], option.defaultTxt2Img);
}

function envCloudImg2Img(id: CloudEngineId): string {
  const option = cloudEngineOption(id)!;
  const prefix = id.toUpperCase();
  return envOr(
    [`NEXT_PUBLIC_${prefix}_IMG2IMG_MODEL`, `${prefix}_IMG2IMG_MODEL`],
    option.defaultImg2Img
  );
}

function cloudModelsFromEnv(): Pick<
  EngineSettings,
  | 'falModel'
  | 'falImg2ImgModel'
  | 'falI2vModel'
  | 'falT2vModel'
  | 'falExtendModel'
  | 'replicateModel'
  | 'replicateImg2ImgModel'
  | 'replicateI2vModel'
  | 'replicateT2vModel'
  | 'openaiModel'
  | 'openaiImg2ImgModel'
  | 'geminiModel'
  | 'geminiImg2ImgModel'
  | 'grokModel'
  | 'grokImg2ImgModel'
> {
  return {
    falModel: envCloudTxt2Img('fal'),
    falImg2ImgModel: envCloudImg2Img('fal'),
    falI2vModel: envOr(['NEXT_PUBLIC_FAL_I2V_MODEL', 'FAL_I2V_MODEL'], DEFAULT_FAL_I2V_MODEL),
    falT2vModel: envOr(['NEXT_PUBLIC_FAL_T2V_MODEL', 'FAL_T2V_MODEL'], DEFAULT_FAL_T2V_MODEL),
    falExtendModel: envOr(
      ['NEXT_PUBLIC_FAL_EXTEND_MODEL', 'FAL_EXTEND_MODEL'],
      DEFAULT_FAL_EXTEND_MODEL
    ),
    replicateModel: envCloudTxt2Img('replicate'),
    replicateImg2ImgModel: envCloudImg2Img('replicate'),
    replicateI2vModel: envOr(
      ['NEXT_PUBLIC_REPLICATE_I2V_MODEL', 'REPLICATE_I2V_MODEL'],
      DEFAULT_REPLICATE_I2V_MODEL
    ),
    replicateT2vModel: envOr(
      ['NEXT_PUBLIC_REPLICATE_T2V_MODEL', 'REPLICATE_T2V_MODEL'],
      DEFAULT_REPLICATE_T2V_MODEL
    ),
    openaiModel: envCloudTxt2Img('openai'),
    openaiImg2ImgModel: envCloudImg2Img('openai'),
    geminiModel: envCloudTxt2Img('gemini'),
    geminiImg2ImgModel: envCloudImg2Img('gemini'),
    grokModel: envCloudTxt2Img('grok'),
    grokImg2ImgModel: envCloudImg2Img('grok'),
  };
}

function cloudModelsFromShared(shared: SharedToolSettings): ReturnType<typeof cloudModelsFromEnv> {
  const fromEnv = cloudModelsFromEnv();
  return {
    falModel: shared.falModel?.trim() || fromEnv.falModel,
    falImg2ImgModel: shared.falImg2ImgModel?.trim() || fromEnv.falImg2ImgModel,
    falI2vModel: shared.falI2vModel?.trim() || fromEnv.falI2vModel,
    falT2vModel: shared.falT2vModel?.trim() || fromEnv.falT2vModel,
    falExtendModel: shared.falExtendModel?.trim() || fromEnv.falExtendModel,
    replicateModel: shared.replicateModel?.trim() || fromEnv.replicateModel,
    replicateImg2ImgModel: shared.replicateImg2ImgModel?.trim() || fromEnv.replicateImg2ImgModel,
    replicateI2vModel: shared.replicateI2vModel?.trim() || fromEnv.replicateI2vModel,
    replicateT2vModel: shared.replicateT2vModel?.trim() || fromEnv.replicateT2vModel,
    openaiModel: shared.openaiModel?.trim() || fromEnv.openaiModel,
    openaiImg2ImgModel: shared.openaiImg2ImgModel?.trim() || fromEnv.openaiImg2ImgModel,
    geminiModel: shared.geminiModel?.trim() || fromEnv.geminiModel,
    geminiImg2ImgModel: shared.geminiImg2ImgModel?.trim() || fromEnv.geminiImg2ImgModel,
    grokModel: shared.grokModel?.trim() || fromEnv.grokModel,
    grokImg2ImgModel: shared.grokImg2ImgModel?.trim() || fromEnv.grokImg2ImgModel,
  };
}

export function loadEngineSettings(): EngineSettings {
  if (typeof window === 'undefined') {
    return {
      engine: envDefaultEngine(),
      diffusersApiUrl: envDefaultDiffusersUrl(),
      diffusersAutoStart: true,
      ...cloudModelsFromEnv(),
    };
  }

  const shared = loadSettingsCache().shared;
  return {
    engine: normalizeEngineId(shared.inferenceEngine ?? envDefaultEngine()),
    diffusersApiUrl: shared.diffusersApiUrl?.trim() || envDefaultDiffusersUrl(),
    diffusersAutoStart: shared.diffusersAutoStart !== false,
    ...cloudModelsFromShared(shared),
  };
}

export function saveEngineSettings(patch: Partial<EngineSettings>): EngineSettings {
  const current = loadEngineSettings();
  const next: EngineSettings = {
    ...current,
    ...patch,
    engine: patch.engine !== undefined ? normalizeEngineId(patch.engine) : current.engine,
    diffusersApiUrl:
      patch.diffusersApiUrl !== undefined
        ? patch.diffusersApiUrl.trim() || envDefaultDiffusersUrl()
        : current.diffusersApiUrl,
    diffusersAutoStart:
      patch.diffusersAutoStart !== undefined
        ? patch.diffusersAutoStart
        : current.diffusersAutoStart,
  };

  const shared: SharedToolSettings = {
    ...loadSettingsCache().shared,
    inferenceEngine: next.engine,
    diffusersApiUrl: next.diffusersApiUrl,
    diffusersAutoStart: next.diffusersAutoStart,
    falModel: next.falModel,
    falImg2ImgModel: next.falImg2ImgModel,
    falI2vModel: next.falI2vModel,
    falT2vModel: next.falT2vModel,
    falExtendModel: next.falExtendModel,
    replicateModel: next.replicateModel,
    replicateImg2ImgModel: next.replicateImg2ImgModel,
    replicateI2vModel: next.replicateI2vModel,
    replicateT2vModel: next.replicateT2vModel,
    openaiModel: next.openaiModel,
    openaiImg2ImgModel: next.openaiImg2ImgModel,
    geminiModel: next.geminiModel,
    geminiImg2ImgModel: next.geminiImg2ImgModel,
    grokModel: next.grokModel,
    grokImg2ImgModel: next.grokImg2ImgModel,
  };
  saveSharedSettings(shared);
  return next;
}

export function resolveCloudTxt2ImgModel(engine: EngineId = loadEngineSettings().engine): string {
  const settings = loadEngineSettings();
  const option = cloudEngineOption(engine);
  if (!option) {
    return defaultCloudTxt2ImgModel(engine);
  }
  return settings[option.modelField] || option.defaultTxt2Img;
}

export function resolveCloudQueueModel(
  engine: EngineId,
  tool?: string,
  extras?: { hasInputImage?: boolean; clipMode?: VideoClipMode }
): string {
  if (tool === 'video' && engine === 'grok') {
    return DEFAULT_GROK_VIDEO_MODEL;
  }
  if (tool === 'video' && engine === 'gemini') {
    return DEFAULT_GEMINI_VIDEO_MODEL;
  }
  if ((engine === 'fal' || engine === 'replicate') && tool === 'video') {
    const settings = loadEngineSettings();
    const clipMode = inferVideoClipMode({
      clipMode: extras?.clipMode,
      hasInitImage: extras?.hasInputImage,
    });
    if (engine === 'replicate') {
      return resolveReplicateVideoModel({
        clipMode,
        i2vModel: settings.replicateI2vModel,
        t2vModel: settings.replicateT2vModel,
      });
    }
    return resolveFalVideoModel({
      clipMode,
      i2vModel: settings.falI2vModel,
      t2vModel: settings.falT2vModel,
      extendModel: settings.falExtendModel,
    });
  }
  return resolveCloudTxt2ImgModel(engine);
}

export function resolveCloudQueueExtras(
  engine: EngineId,
  input?: {
    hasInputImage?: boolean;
    inputImageFilename?: string;
    inputImageFilenames?: string[];
    tool?: string;
    clipMode?: VideoClipMode;
    videoUrl?: string;
  }
): Record<string, unknown> {
  const shared = loadSettingsCache().shared;
  const settings = loadEngineSettings();
  const option = cloudEngineOption(engine);
  const clipMode =
    (engine === 'fal' || engine === 'replicate') && input?.tool === 'video'
      ? inferVideoClipMode({
          clipMode: input.clipMode,
          hasInitImage: input.hasInputImage,
        })
      : undefined;
  const common = {
    hasInputImage: input?.hasInputImage === true,
    inputImageFilename: input?.inputImageFilename,
    ...(input?.inputImageFilenames?.some(name => name?.trim())
      ? { inputImageFilenames: input.inputImageFilenames }
      : {}),
    tool: input?.tool,
    ...(clipMode ? { clipMode } : {}),
    ...(input?.videoUrl?.trim() ? { videoUrl: input.videoUrl.trim() } : {}),
  };
  if (!option) {
    return common;
  }
  return {
    ...common,
    [option.tokenBodyKey]: shared[option.sessionTokenField],
    img2imgModel: settings[option.img2imgField] || defaultCloudImg2ImgModel(engine),
    ...(engine === 'fal'
      ? {
          i2vModel: settings.falI2vModel || DEFAULT_FAL_I2V_MODEL,
          t2vModel: settings.falT2vModel || DEFAULT_FAL_T2V_MODEL,
          extendModel: settings.falExtendModel || DEFAULT_FAL_EXTEND_MODEL,
        }
      : {}),
    ...(engine === 'replicate'
      ? {
          i2vModel: settings.replicateI2vModel || DEFAULT_REPLICATE_I2V_MODEL,
          t2vModel: settings.replicateT2vModel || DEFAULT_REPLICATE_T2V_MODEL,
        }
      : {}),
  };
}

export function resolveCloudEngineHost(engine: EngineId): string {
  return cloudEngineHost(engine);
}

export { CLOUD_ENGINE_OPTIONS, isCloudEngine };
