'use client';

import { useEffect } from 'react';
import { isSceneGenerationModel, resolveTxt2iCounterpartForGenerate } from '@/lib/queue-tool-model';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { RoleplayPlayAs } from '@/lib/roleplay';
import {
  useRoleplayBeatQueueCore,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { useRoleplayBeatQueuePart2 } from '@/hooks/roleplay/useRoleplayBeatQueuePart2';

export type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueue(options: UseRoleplayBeatQueueOptions) {
  const core = useRoleplayBeatQueueCore(options);
  const part2 = useRoleplayBeatQueuePart2(options, core);
  return { ...core, ...part2 };
}

export function useRoleplayPhotoModelGuard(options: {
  mounted: boolean;
  playAs: RoleplayPlayAs;
  sharedModel: SharedToolSettings['model'];
  updateShared: (patch: Partial<SharedToolSettings>) => void;
}) {
  const { mounted, playAs, sharedModel, updateShared } = options;
  useEffect(() => {
    if (!mounted || playAs !== 'photo') {
      return;
    }
    if (isSceneGenerationModel(sharedModel)) {
      return;
    }
    const next = resolveTxt2iCounterpartForGenerate(sharedModel);
    if (next !== sharedModel) {
      updateShared({ model: next });
    }
  }, [mounted, playAs, sharedModel, updateShared]);
}
