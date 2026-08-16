import {
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
} from './engine/capabilities';
import { isAllowedFalMediaUrl } from './fal-protocol';

export const VIDEO_CLIP_MODES = ['t2v', 'i2v', 'extend'] as const;
export type VideoClipMode = (typeof VIDEO_CLIP_MODES)[number];

export const DEFAULT_VIDEO_CLIP_MODE: VideoClipMode = 't2v';

export function normalizeVideoClipMode(value: unknown): VideoClipMode {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  if (id === 'extend' || id === 'v2v' || id === 'video-to-video') {
    return 'extend';
  }
  if (id === 'i2v' || id === 'image-to-video' || id === 'img2vid' || id === 'continue') {
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
  extendModel?: string | null;
}): string {
  if (input.clipMode === 'extend') {
    return input.extendModel?.trim() || DEFAULT_FAL_EXTEND_MODEL;
  }
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
  if (input.clipMode === 'i2v' || input.clipMode === 'extend') {
    return input.i2vModel?.trim() || DEFAULT_REPLICATE_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_REPLICATE_T2V_MODEL;
}

export function falVideoRequiresFirstFrame(clipMode: VideoClipMode): boolean {
  return clipMode === 'i2v';
}

export function falVideoRequiresParentClip(clipMode: VideoClipMode): boolean {
  return clipMode === 'extend';
}

/** Fal extend-video can fetch only public Fal-hosted https clips. */
export function canFalExtendFromParentUrl(url: string | undefined | null): boolean {
  const trimmed = String(url ?? '').trim();
  return Boolean(trimmed) && isAllowedFalMediaUrl(trimmed);
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

/** Kling/WAN want '5'|'10'; LTX/Grok want a number; Veo wants '4s'|'6s'|'8s'. */
export function falVideoDurationPayload(
  modelId: string | undefined,
  seconds?: number | null
): string | number {
  const snapped = snapFalVideoDurationSec(seconds);
  const id = String(modelId ?? '');
  if (/veo3/i.test(id)) {
    return snapped >= 8 ? '8s' : '6s';
  }
  if (/extend-video/i.test(id)) {
    return snapped >= 8 ? 10 : 5;
  }
  if (/ltx/i.test(id) || /grok-imagine-video/i.test(id)) {
    return snapped >= 8 ? 10 : 6;
  }
  return String(snapped);
}

/** Documented Fal LTX extend-video fields. Parent must already be a Fal https clip. */
export function falExtendQueueFields(
  parentUrl: string,
  durationSec?: number | null
): { video_url: string; mode: 'end'; duration: number } {
  return {
    video_url: parentUrl.trim(),
    mode: 'end',
    duration: Number(falVideoDurationPayload(DEFAULT_FAL_EXTEND_MODEL, durationSec)),
  };
}

/** Replicate Kling wants 5|10; documented LTX 2.3 wants 6|10. */
export function replicateVideoDurationPayload(
  modelId: string | undefined,
  seconds?: number | null
): number {
  const snapped = snapFalVideoDurationSec(seconds);
  return /ltx/i.test(String(modelId ?? '')) ? (snapped >= 8 ? 10 : 6) : snapped;
}
