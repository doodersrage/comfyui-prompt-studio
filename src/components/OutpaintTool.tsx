'use client';

import { useOutpaintToolOrchestration } from '@/hooks/useOutpaintToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import OutpaintToolSections from '@/components/outpaint/OutpaintToolSections';

export default function OutpaintTool() {
  const description = useToolPageDescription(
    'Pad the canvas and inpaint the new border so the scene continues outward. Uses the same quality recipes, LoRA stack, and Final promote path as Inpaint.',
    'Extend the canvas outward — pad edges and inpaint the new border.'
  );
  const vm = useOutpaintToolOrchestration();

  if (!vm.mounted) {
    return null;
  }

  return <OutpaintToolSections description={description} {...vm} />;
}
