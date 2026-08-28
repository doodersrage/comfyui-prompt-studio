'use client';

import { useStudioToolOrchestration } from '@/hooks/useStudioToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import StudioToolSections from '@/components/studio/StudioToolSections';

export default function StudioTool() {
  const description = useToolPageDescription(
    'History, model comparison, catalog browser, and template slots.',
    'Saved prompts, quick compare, and templates — essentials without the full lab.'
  );
  const vm = useStudioToolOrchestration();

  return <StudioToolSections description={description} {...vm} />;
}
