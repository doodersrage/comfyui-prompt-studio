"use client";

import {
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from "./settings-cache";
import type { EngineId } from "./engine/types";
import { DEFAULT_DIFFUSERS_API_URL } from "./diffusers-client";

export type EngineSettings = {
  engine: EngineId;
  diffusersApiUrl: string;
};

function normalizeEngineId(value: unknown): EngineId {
  return value === "diffusers" ? "diffusers" : "comfyui";
}

function envDefaultEngine(): EngineId {
  if (typeof process !== "undefined") {
    const raw =
      process.env.NEXT_PUBLIC_PROMPT_ENGINE?.trim().toLowerCase() ||
      process.env.PROMPT_ENGINE?.trim().toLowerCase();
    if (raw === "diffusers") {
      return "diffusers";
    }
  }
  return "comfyui";
}

function envDefaultDiffusersUrl(): string {
  if (typeof process !== "undefined") {
    const raw =
      process.env.NEXT_PUBLIC_DIFFUSERS_API_URL?.trim() ||
      process.env.DIFFUSERS_API_URL?.trim();
    if (raw) {
      return raw;
    }
  }
  return DEFAULT_DIFFUSERS_API_URL;
}

export function loadEngineSettings(): EngineSettings {
  if (typeof window === "undefined") {
    return {
      engine: envDefaultEngine(),
      diffusersApiUrl: envDefaultDiffusersUrl(),
    };
  }

  const shared = loadSettingsCache().shared;
  return {
    engine: normalizeEngineId(shared.inferenceEngine ?? envDefaultEngine()),
    diffusersApiUrl:
      shared.diffusersApiUrl?.trim() || envDefaultDiffusersUrl(),
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
  };

  const shared: SharedToolSettings = {
    ...loadSettingsCache().shared,
    inferenceEngine: next.engine,
    diffusersApiUrl: next.diffusersApiUrl,
  };
  saveSharedSettings(shared);
  return next;
}
