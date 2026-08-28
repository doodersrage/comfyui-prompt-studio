'use client';

import VariationGridToolSections from '@/components/variations/VariationGridToolSections';
import { useVariationGridOrchestration } from '@/hooks/useVariationGridOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';

export default function VariationGridTool() {
  const description = useToolPageDescription(
    'Roll prompt variations from the same hints, then batch-queue with unique seeds.',
    'Roll variations from your hints, then queue the grid.'
  );
  const vm = useVariationGridOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <VariationGridToolSections description={description} {...vm} />;
}
