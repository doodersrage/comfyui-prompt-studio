'use client';

import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import type { EngineId } from './engine/types';
import {
  DEFAULT_FAL_IMG2IMG_MODEL,
  DEFAULT_FAL_TXT2IMG_MODEL,
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
};

function envDefaultEngine(): EngineId {
  if (typeof process !== 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_PROMPT_ENGINE?.trim().toLowerCase() ||
      process.env.PROMPT_ENGINE?.trim().toLowerCase();
    if (raw === 'diffusers' || raw === 'fal') {
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

function envDefaultFalModel(): string {
  if (typeof process !== 'undefined') {
    const raw = process.env.NEXT_PUBLIC_FAL_MODEL?.trim() || process.env.FAL_MODEL?.trim();
    if (raw) {
      return raw;
    }
  }
  return DEFAULT_FAL_TXT2IMG_MODEL;
}

function envDefaultFalImg2ImgModel(): string {
  if (typeof process !== 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_FAL_IMG2IMG_MODEL?.trim() || process.env.FAL_IMG2IMG_MODEL?.trim();
    if (raw) {
      return raw;
    }
  }
  return DEFAULT_FAL_IMG2IMG_MODEL;
}

export function loadEngineSettings(): EngineSettings {
  if (typeof window === 'undefined') {
    return {
      engine: envDefaultEngine(),
      diffusersApiUrl: envDefaultDiffusersUrl(),
      diffusersAutoStart: true,
      falModel: envDefaultFalModel(),
      falImg2ImgModel: envDefaultFalImg2ImgModel(),
    };
  }

  const shared = loadSettingsCache().shared;
  return {
    engine: normalizeEngineId(shared.inferenceEngine ?? envDefaultEngine()),
    diffusersApiUrl: shared.diffusersApiUrl?.trim() || envDefaultDiffusersUrl(),
    diffusersAutoStart: shared.diffusersAutoStart !== false,
    falModel: shared.falModel?.trim() || envDefaultFalModel(),
    falImg2ImgModel: shared.falImg2ImgModel?.trim() || envDefaultFalImg2ImgModel(),
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
  };

  const shared: SharedToolSettings = {
    ...loadSettingsCache().shared,
    inferenceEngine: next.engine,
    diffusersApiUrl: next.diffusersApiUrl,
    diffusersAutoStart: next.diffusersAutoStart,
    falModel: next.falModel,
    falImg2ImgModel: next.falImg2ImgModel,
  };
  saveSharedSettings(shared);
  return next;
}
