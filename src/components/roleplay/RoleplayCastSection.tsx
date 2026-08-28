'use client';

import { ToolSection } from '@/components/ui/ToolPageShell';
import { RoleplayCastActionsSection } from '@/components/roleplay/sections/RoleplayCastActionsSection';
import { RoleplayCastArchetypeSection } from '@/components/roleplay/sections/RoleplayCastArchetypeSection';
import { RoleplayCastPhotoSection } from '@/components/roleplay/sections/RoleplayCastPhotoSection';
import { RoleplayCastToneSettingSection } from '@/components/roleplay/sections/RoleplayCastToneSettingSection';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';

export type {
  RoleplayCastApplyReferenceInput,
  RoleplayCastSectionProps,
} from '@/components/roleplay/roleplay-cast-section-types';

export default function RoleplayCastSection(props: RoleplayCastSectionProps) {
  return (
    <ToolSection title="Cast yourself">
      <p className="text-sm text-[var(--text-muted)]">
        Pick a part — raccoon pirate, sentient toaster, bad-at-haunting ghost — or type your own.
        Optional: play as yourself from a photo, or lock an existing generated still.
      </p>
      <RoleplayCastArchetypeSection {...props} />
      <RoleplayCastPhotoSection {...props} />
      <RoleplayCastToneSettingSection {...props} />
      <RoleplayCastActionsSection {...props} />
    </ToolSection>
  );
}
