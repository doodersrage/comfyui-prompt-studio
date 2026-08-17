/**
 * Roleplay-as-film — still vs clip beats, and clip→clip last-frame I2V lineage.
 * `derivedKind: 'extend'` means continue from the last frame, not a V2V/extend API.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { isHtmlVideoViewUrl, isMotionViewUrl } from './comfyui-outputs';
import type { RoleplayStoryBeat } from './roleplay';
import { lastCompletedRoleplayStillUrl } from './roleplay';

export type RoleplayBeatOutput = 'still' | 'clip';

export function normalizeRoleplayBeatOutput(value: unknown): RoleplayBeatOutput {
  return value === 'still' ? 'still' : 'clip';
}

export function isVideoLikeEntry(
  entry: Pick<ComfyGalleryEntry, 'derivedKind' | 'tool'> | undefined
): boolean {
  if (!entry) {
    return false;
  }
  return (
    entry.derivedKind === 'i2v' ||
    entry.derivedKind === 't2v' ||
    entry.derivedKind === 'extend' ||
    entry.tool === 'video'
  );
}

export function isGalleryClipEntry(
  entry: Pick<ComfyGalleryEntry, 'derivedKind' | 'tool'> & { mediaKind?: string }
): boolean {
  return entry.derivedKind === 'film' || isVideoLikeEntry(entry) || entry.mediaKind === 'video';
}

export function nextRoleplayMotionKind(
  parent: Pick<ComfyGalleryEntry, 'derivedKind' | 'tool'> | undefined
): 't2v' | 'i2v' | 'extend' {
  if (!parent) {
    return 't2v';
  }
  return isVideoLikeEntry(parent) ? 'extend' : 'i2v';
}

export function lastRoleplayMotionBeat(
  story: RoleplayStoryBeat[] | null | undefined
): RoleplayStoryBeat | undefined {
  const beats = story ?? [];
  for (let index = beats.length - 1; index >= 0; index -= 1) {
    const beat = beats[index];
    if (!beat) {
      continue;
    }
    if (beat.clipStatus === 'completed' && beat.clipUrl?.trim()) {
      return beat;
    }
    if (lastCompletedRoleplayStillUrl(beat) || beat.imageUrl?.trim()) {
      return beat;
    }
  }
  return undefined;
}

export function lastRoleplayMotionSource(
  story: RoleplayStoryBeat[] | null | undefined
): { imageUrl: string; parentPromptId?: string; fromClip: boolean } | null {
  const beat = lastRoleplayMotionBeat(story);
  if (!beat) {
    return null;
  }
  const clipUrl = beat.clipStatus === 'completed' ? beat.clipUrl?.trim() : '';
  if (clipUrl) {
    return {
      imageUrl: clipUrl,
      parentPromptId: beat.clipPromptId?.trim() || beat.promptId?.trim(),
      fromClip: true,
    };
  }
  const stillUrl = lastCompletedRoleplayStillUrl(beat) || beat.imageUrl?.trim();
  if (!stillUrl) {
    return null;
  }
  return {
    imageUrl: stillUrl,
    parentPromptId: beat.promptId?.trim(),
    fromClip: false,
  };
}

export function shouldAutoQueueRoleplayClip(beat: RoleplayStoryBeat): boolean {
  if (beat.clipPromptId?.trim()) {
    return false;
  }
  const status = beat.clipStatus;
  if (
    status === 'writing' ||
    status === 'queued' ||
    status === 'running' ||
    status === 'completed'
  ) {
    return false;
  }
  if (beat.stillStatus === 'completed' && beat.imageUrl?.trim()) {
    return true;
  }
  // Text-only beat: queue T2V once the prompt exists.
  return Boolean(beat.prompt?.trim()) && !beat.imageUrl?.trim() && beat.stillStatus !== 'writing';
}

/** True when a `<video>` element can play this URL (not animated webp/gif). */
export function looksLikeVideoUrl(url: string): boolean {
  return isHtmlVideoViewUrl(url);
}

/** True for mp4/webm or animated webp/gif — play in-place instead of a still. */
export function looksLikeMotionUrl(url: string): boolean {
  return isMotionViewUrl(url);
}
