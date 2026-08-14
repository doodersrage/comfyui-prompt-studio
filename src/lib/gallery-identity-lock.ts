'use client';

import {
  DEFAULT_COMPOSE_IDENTITY_KIND,
  DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH,
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
} from './compose-identity-lock';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { resolveComfyOutputMediaKind } from './comfyui-outputs';
import { resolveQueueInputImage } from './queue-input-image';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';

export function galleryEntryCanLockFace(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images'>
): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  const image = entry.images?.[0];
  if (!image?.filename?.trim()) {
    return false;
  }
  return resolveComfyOutputMediaKind(image) === 'image';
}

/** Upload this still into Comfy input and lock it as the Generate identity ref. */
export async function applyGalleryFaceToSession(entry: ComfyGalleryEntry): Promise<{
  ok: boolean;
  filename?: string;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Browser only.' };
  }
  if (!galleryEntryCanLockFace(entry)) {
    return { ok: false, error: 'This still has no image to lock.' };
  }
  const { galleryEntryPrimaryViewUrl } = await import('./comfyui-gallery');
  const viewUrl = galleryEntryPrimaryViewUrl(entry);
  if (!viewUrl) {
    return { ok: false, error: 'No view URL for this still.' };
  }

  try {
    const uploaded = await resolveQueueInputImage({
      imageUrl: viewUrl,
      filename: entry.images[0]?.filename?.trim() || `gallery-face-${Date.now()}.png`,
      model: entry.model,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) {
      return { ok: false, error: 'Upload did not return a filename.' };
    }
    const shared = loadSettingsCache().shared;
    saveSharedSettings(
      {
        ...shared,
        ipAdapterImageFilename: filename,
        ipAdapterImageFilenames: [filename],
        ipAdapterImageUrl: viewUrl,
        ipAdapterStrength: normalizeComposeIdentityLockStrength(
          shared.ipAdapterStrength ?? DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH
        ),
        identityKind: normalizeComposeIdentityKind(
          shared.identityKind ?? DEFAULT_COMPOSE_IDENTITY_KIND
        ),
      },
      { notify: true }
    );
    void import('./app-toast').then(({ pushAppToast }) => {
      pushAppToast({
        text: `Face locked on Generate · ${filename}`,
        href: '/',
      });
    });
    return { ok: true, filename };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Face lock upload failed.';
    void import('./app-toast').then(({ pushAppToast }) => {
      pushAppToast({ text: message, tone: 'warning' });
    });
    return { ok: false, error: message };
  }
}
