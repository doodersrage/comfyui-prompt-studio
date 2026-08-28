'use client';

import { useSharedToolGenerationSettingsCore } from '@/hooks/shared-tool/useSharedToolGenerationSettingsCore';
import { useSharedToolGenerationSettingsPart2 } from '@/hooks/shared-tool/useSharedToolGenerationSettingsPart2';
import type {
  UseSharedToolGenerationSettingsOptions,
  UseSharedToolGenerationSettingsResult,
} from '@/hooks/shared-tool/shared-tool-generation-settings-types';

export type {
  UseSharedToolGenerationSettingsOptions,
  UseSharedToolGenerationSettingsResult,
} from '@/hooks/shared-tool/shared-tool-generation-settings-types';

export function useSharedToolGenerationSettings(
  options: UseSharedToolGenerationSettingsOptions
): UseSharedToolGenerationSettingsResult {
  const core = useSharedToolGenerationSettingsCore(options);
  const part2 = useSharedToolGenerationSettingsPart2(options, core);
  return part2;
}
