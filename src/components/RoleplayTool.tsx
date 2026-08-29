'use client';

import { useRoleplayToolOrchestration } from '@/hooks/useRoleplayToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import RoleplayToolSections from '@/components/roleplay/RoleplayToolSections';

export default function RoleplayTool() {
  const description = useToolPageDescription(
    'Cast yourself as someone (or something). Clip mode turns each beat into motion — still, then I2V, then Extend / last-frame / Stitch continue by engine.',
    'Pick a character, write a bio, tap a scene — Extend, last-frame, or Stitch continue by engine.'
  );
  const vm = useRoleplayToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <RoleplayToolSections description={description} {...vm} />;
}
