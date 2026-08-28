'use client';

import { useControlNetToolOrchestration } from '@/hooks/useControlNetToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import ControlNetToolSections from '@/components/controlnet/ControlNetToolSections';

export default function ControlNetTool() {
  const description = useToolPageDescription(
    'Structure-focused prompts for depth, pose, canny, and lineart conditioning.',
    'Guide structure with depth, pose, canny, or lineart — then generate.'
  );
  const vm = useControlNetToolOrchestration();
  return <ControlNetToolSections description={description} {...vm} />;
}
