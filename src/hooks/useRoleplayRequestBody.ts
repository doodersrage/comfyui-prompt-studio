'use client';

import { useCallback, type MutableRefObject } from 'react';
import { buildRoleplayRequestBody } from '@/lib/roleplay-play-core';
import {
  mergeRoleplayRejectedScenes,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayPlayAs,
  type RoleplayScene,
  type RoleplayTone,
} from '@/lib/roleplay';
import type { RoleplayToolCache, SharedToolSettings } from '@/lib/settings-cache';

type UseRoleplayRequestBodyOptions = {
  shared: SharedToolSettings;
  personaId: string;
  toolSettings: RoleplayToolCache;
  tone: RoleplayTone;
  content: RoleplayContentId;
  playAsResolved: RoleplayPlayAs;
  hasReferenceImage: boolean;
  bio: RoleplayBio | undefined;
  rejectedScenesMemory: RoleplayScene[];
  scenesRef: MutableRefObject<RoleplayScene[]>;
};

export function useRoleplayRequestBody({
  shared,
  personaId,
  toolSettings,
  tone,
  content,
  playAsResolved,
  hasReferenceImage,
  bio,
  rejectedScenesMemory,
  scenesRef,
}: UseRoleplayRequestBodyOptions) {
  return useCallback(
    (
      action: 'bio' | 'scenes' | 'prompt',
      situation?: Parameters<typeof buildRoleplayRequestBody>[0]['situation']
    ) =>
      buildRoleplayRequestBody({
        action,
        situation,
        shared,
        personaId,
        customPersona: toolSettings.customPersona,
        characterName: toolSettings.characterName,
        extraHints: toolSettings.extraHints,
        setting: toolSettings.setting,
        tone,
        content,
        allowGore: toolSettings.allowGore,
        hasReferenceImage: playAsResolved === 'photo' && hasReferenceImage,
        isolatedSubject:
          playAsResolved === 'photo' &&
          hasReferenceImage &&
          toolSettings.referenceIsolated === true,
        bio,
        story: toolSettings.story,
        rejectedScenes: mergeRoleplayRejectedScenes(rejectedScenesMemory, scenesRef.current),
      }),
    [
      bio,
      content,
      hasReferenceImage,
      personaId,
      playAsResolved,
      rejectedScenesMemory,
      scenesRef,
      shared,
      tone,
      toolSettings.allowGore,
      toolSettings.characterName,
      toolSettings.customPersona,
      toolSettings.extraHints,
      toolSettings.referenceIsolated,
      toolSettings.setting,
      toolSettings.story,
    ]
  );
}
