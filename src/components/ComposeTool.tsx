'use client';

import { useComposeToolOrchestration } from '@/hooks/useComposeToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import ComposeToolSections from '@/components/compose/ComposeToolSections';

export default function ComposeTool() {
  const description = useToolPageDescription(
    'Multi-image transfer or single-image edits. Reference Image 1, Image 2, etc. in your prompt.',
    'Combine or edit images with figure slots and a composed prompt.'
  );
  const vm = useComposeToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <ComposeToolSections description={description} {...vm} />;
}
