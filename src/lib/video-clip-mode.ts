import {
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
} from './engine/capabilities';

export const VIDEO_CLIP_MODES = ['t2v', 'i2v'] as const;
export type VideoClipMode = (typeof VIDEO_CLIP_MODES)[number];

export const DEFAULT_VIDEO_CLIP_MODE: VideoClipMode = 't2v';

export function normalizeVideoClipMode(value: unknown): VideoClipMode {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  if (id === 'i2v' || id === 'image-to-video' || id === 'img2vid') {
    return 'i2v';
  }
  if (id === 't2v' || id === 'text-to-video' || id === 'txt2vid') {
    return 't2v';
  }
  return DEFAULT_VIDEO_CLIP_MODE;
}

export function inferVideoClipMode(input: {
  clipMode?: unknown;
  hasInitImage?: boolean;
}): VideoClipMode {
  if (input.clipMode != null && String(input.clipMode).trim()) {
    return normalizeVideoClipMode(input.clipMode);
  }
  return input.hasInitImage ? 'i2v' : 't2v';
}

export function resolveFalVideoModel(input: {
  clipMode: VideoClipMode;
  i2vModel?: string | null;
  t2vModel?: string | null;
}): string {
  if (input.clipMode === 'i2v') {
    return input.i2vModel?.trim() || DEFAULT_FAL_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_FAL_T2V_MODEL;
}

export function resolveReplicateVideoModel(input: {
  clipMode: VideoClipMode;
  i2vModel?: string | null;
  t2vModel?: string | null;
}): string {
  if (input.clipMode === 'i2v') {
    return input.i2vModel?.trim() || DEFAULT_REPLICATE_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_REPLICATE_T2V_MODEL;
}

export function falVideoRequiresFirstFrame(clipMode: VideoClipMode): boolean {
  return clipMode === 'i2v';
}

/** Fal Kling / WAN video endpoints only accept 5s or 10s. */
export const FAL_VIDEO_DURATION_SECONDS = [5, 10] as const;
export type FalVideoDurationSec = (typeof FAL_VIDEO_DURATION_SECONDS)[number];

export function snapFalVideoDurationSec(seconds?: number | null): FalVideoDurationSec {
  const value = Number(seconds);
  if (!Number.isFinite(value)) {
    return 5;
  }
  return value >= 8 ? 10 : 5;
}
