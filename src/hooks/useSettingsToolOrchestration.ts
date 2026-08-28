'use client';

import { useSettingsToolOrchestrationCore } from '@/hooks/settings/useSettingsToolOrchestrationCore';
import { useSettingsToolOrchestrationPart2 } from '@/hooks/settings/useSettingsToolOrchestrationPart2';

export function useSettingsToolOrchestration() {
  const core = useSettingsToolOrchestrationCore();
  const part2 = useSettingsToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
