'use client';

import { useRefineToolOrchestration } from '@/hooks/useRefineToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import RefineToolSections from '@/components/refine/RefineToolSections';

export default function RefineTool() {
  const description = useToolPageDescription(
    'Upload a reference image and refine a prompt against your intent.',
    'Upload a reference image and refine the prompt to match your intent.'
  );
  const vm = useRefineToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <RefineToolSections description={description} {...vm} />;
}
