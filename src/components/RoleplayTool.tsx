'use client';

import { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import RoleplayToolSections from '@/components/roleplay/RoleplayToolSections';

export default function RoleplayTool() {
  const description = useToolPageDescription(
    'Cast yourself as someone (or something). Clip mode turns each beat into motion — still, then I2V, then Fal extend-video or last-frame I2V.',
    'Pick a character, write a bio, tap a scene — clips extend on Fal or continue from the last frame.'
  );
  const vm = useRoleplayToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <RoleplayToolSections description={description} {...vm} />;
}
