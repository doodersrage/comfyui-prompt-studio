'use client';

import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import type { EngineId } from './engine/types';
import {
  DEFAULT_FAL_IMG2IMG_MODEL,
  DEFAULT_FAL_TXT2IMG_MODEL,
  DEFAULT_REPLICATE_IMG2IMG_MODEL,
  DEFAULT_REPLICATE_TXT2IMG_MODEL,
  cloudEngineHost,
  isCloudEngine,
  normalizeEngineId,
} from './engine/capabilities';
import { DEFAULT_DIFFUSERS_API_URL } from './diffusers-client';

export type EngineSettings = {
  engine: EngineId;
  diffusersApiUrl: string;
  /** Spawn local Diffusers when health fails (default true). */
  diffusersAutoStart: boolean;
  falModel: string;
  falImg2ImgModel: string;
  replicateModel: string;
  replicateImg2ImgModel: string;
};

function envDefaultEngine(): EngineId {
  if (typeof process !== 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_PROMPT_ENGINE?.trim().toLowerCase() ||
      process.env.PROMPT_ENGINE?.trim().toLowerCase();
    if (raw === 'diffusers' || raw === 'fal' || raw === 'replicate') {
      return raw;
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

function envDefaultFalModel(): string {
  return envOr(['NEXT_PUBLIC_FAL_MODEL', 'FAL_MODEL'], DEFAULT_FAL_TXT2IMG_MODEL);
}

function envDefaultFalImg2ImgModel(): string {
  return envOr(['NEXT_PUBLIC_FAL_IMG2IMG_MODEL', 'FAL_IMG2IMG_MODEL'], DEFAULT_FAL_IMG2IMG_MODEL);
}

function envDefaultReplicateModel(): string {
  return envOr(['NEXT_PUBLIC_REPLICATE_MODEL', 'REPLICATE_MODEL'], DEFAULT_REPLICATE_TXT2IMG_MODEL);
}

function envDefaultReplicateImg2ImgModel(): string {
  return envOr(
    ['NEXT_PUBLIC_REPLICATE_IMG2IMG_MODEL', 'REPLICATE_IMG2IMG_MODEL'],
    DEFAULT_REPLICATE_IMG2IMG_MODEL
  );
}

export function loadEngineSettings(): EngineSettings {
  if (typeof window === 'undefined') {
    return {
      engine: envDefaultEngine(),
      diffusersApiUrl: envDefaultDiffusersUrl(),
      diffusersAutoStart: true,
      falModel: envDefaultFalModel(),
      falImg2ImgModel: envDefaultFalImg2ImgModel(),
      replicateModel: envDefaultReplicateModel(),
      replicateImg2ImgModel: envDefaultReplicateImg2ImgModel(),
    };
  }

  const shared = loadSettingsCache().shared;
  return {
    engine: normalizeEngineId(shared.inferenceEngine ?? envDefaultEngine()),
    diffusersApiUrl: shared.diffusersApiUrl?.trim() || envDefaultDiffusersUrl(),
    diffusersAutoStart: shared.diffusersAutoStart !== false,
    falModel: shared.falModel?.trim() || envDefaultFalModel(),
    falImg2ImgModel: shared.falImg2ImgModel?.trim() || envDefaultFalImg2ImgModel(),
    replicateModel: shared.replicateModel?.trim() || envDefaultReplicateModel(),
    replicateImg2ImgModel:
      shared.replicateImg2ImgModel?.trim() || envDefaultReplicateImg2ImgModel(),
  };
}

export function saveEngineSettings(patch: Partial<EngineSettings>): EngineSettings {
  const current = loadEngineSettings();
  const next: EngineSettings = {
    engine: patch.engine !== undefined ? normalizeEngineId(patch.engine) : current.engine,
    diffusersApiUrl:
      patch.diffusersApiUrl !== undefined
        ? patch.diffusersApiUrl.trim() || envDefaultDiffusersUrl()
        : current.diffusersApiUrl,
    diffusersAutoStart:
      patch.diffusersAutoStart !== undefined
        ? patch.diffusersAutoStart
        : current.diffusersAutoStart,
    falModel:
      patch.falModel !== undefined
        ? patch.falModel.trim() || envDefaultFalModel()
        : current.falModel,
    falImg2ImgModel:
      patch.falImg2ImgModel !== undefined
        ? patch.falImg2ImgModel.trim() || envDefaultFalImg2ImgModel()
        : current.falImg2ImgModel,
    replicateModel:
      patch.replicateModel !== undefined
        ? patch.replicateModel.trim() || envDefaultReplicateModel()
        : current.replicateModel,
    replicateImg2ImgModel:
      patch.replicateImg2ImgModel !== undefined
        ? patch.replicateImg2ImgModel.trim() || envDefaultReplicateImg2ImgModel()
        : current.replicateImg2ImgModel,
  };

  const shared: SharedToolSettings = {
    ...loadSettingsCache().shared,
    inferenceEngine: next.engine,
    diffusersApiUrl: next.diffusersApiUrl,
    diffusersAutoStart: next.diffusersAutoStart,
    falModel: next.falModel,
    falImg2ImgModel: next.falImg2ImgModel,
    replicateModel: next.replicateModel,
    replicateImg2ImgModel: next.replicateImg2ImgModel,
  };
  saveSharedSettings(shared);
  return next;
}

export function resolveCloudTxt2ImgModel(engine: EngineId = loadEngineSettings().engine): string {
  const settings = loadEngineSettings();
  return engine === 'replicate' ? settings.replicateModel : settings.falModel;
}

export function resolveCloudQueueExtras(
  engine: EngineId,
  input?: { hasInputImage?: boolean; inputImageFilename?: string }
): Record<string, unknown> {
  const shared = loadSettingsCache().shared;
  const settings = loadEngineSettings();
  const common = {
    hasInputImage: input?.hasInputImage === true,
    inputImageFilename: input?.inputImageFilename,
  };
  if (engine === 'replicate') {
    return {
      ...common,
      replicateApiToken: shared.sessionReplicateApiToken,
      img2imgModel: settings.replicateImg2ImgModel,
    };
  }
  return {
    ...common,
    falApiKey: shared.sessionFalApiKey,
    img2imgModel: settings.falImg2ImgModel,
  };
}

export function resolveCloudEngineHost(engine: EngineId): string {
  return cloudEngineHost(engine);
}

export { isCloudEngine };
