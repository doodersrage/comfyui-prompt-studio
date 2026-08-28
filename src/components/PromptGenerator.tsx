'use client';

import GenerateToolSections from '@/components/generate/GenerateToolSections';
import { useGenerateToolOrchestration } from '@/hooks/useGenerateToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';

export default function PromptGenerator() {
  const description = useToolPageDescription(
    'Describe a scene or roll a random one. Pick model and detail in the sidebar, then generate a ComfyUI-ready prompt.',
    'Describe a scene or roll random — generate a ComfyUI-ready prompt.'
  );
  const vm = useGenerateToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <GenerateToolSections description={description} {...vm} />;
}
