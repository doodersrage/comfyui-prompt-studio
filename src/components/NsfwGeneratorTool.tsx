'use client';

import { useNsfwGeneratorToolOrchestration } from '@/hooks/useNsfwGeneratorToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import NsfwGeneratorToolSections from '@/components/nsfw-generator/NsfwGeneratorToolSections';

export default function NsfwGeneratorTool() {
  const description = useToolPageDescription(
    'Adult scene prompts with presets. Requires env flag on server and client.',
    'Explicit adult scenes — pick a preset, add hints, generate, and queue.'
  );
  const vm = useNsfwGeneratorToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <NsfwGeneratorToolSections description={description} {...vm} />;
}
