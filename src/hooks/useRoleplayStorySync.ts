'use client';

import { useEffect, type MutableRefObject } from 'react';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  mergeRoleplayStoryStills,
  roleplayStoryPromptIds,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';

/** Keep Roleplay story beats in sync with gallery stills for a shared session. */
export function useRoleplayStorySync(
  storyRef: MutableRefObject<RoleplayStoryBeat[]>,
  updateToolSettings: (patch: { story: RoleplayStoryBeat[] }) => void
): void {
  useEffect(() => {
    const sync = () => {
      const current = storyRef.current;
      if (current.length === 0) {
        return;
      }
      const wanted = new Set(roleplayStoryPromptIds(current));
      if (wanted.size === 0) {
        return;
      }
      const stills = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
        }));
      const merged = mergeRoleplayStoryStills(current, stills);
      if (merged.changed) {
        updateToolSettings({ story: merged.story });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
    sync();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
  }, [storyRef, updateToolSettings]);
}
