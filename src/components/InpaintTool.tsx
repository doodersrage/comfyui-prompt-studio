'use client';

import { useInpaintToolOrchestration } from '@/hooks/useInpaintToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import InpaintToolSections from '@/components/inpaint/InpaintToolSections';

export default function InpaintTool() {
  const description = useToolPageDescription(
    'Paint a mask and describe what belongs inside it. Queue regenerates only the masked region.',
    'Paint a mask, describe the change, and queue inpaint for the masked region.'
  );
  const vm = useInpaintToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <InpaintToolSections description={description} {...vm} />;
}
