'use client';

import { useImagePromptToolOrchestration } from '@/hooks/useImagePromptToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import ImagePromptToolSections from '@/components/image-prompt/ImagePromptToolSections';

export default function ImagePromptTool() {
  const description = useToolPageDescription(
    'Upload a reference image and convert it into a model-ready prompt.',
    'Upload a reference image to build a prompt.'
  );
  const vm = useImagePromptToolOrchestration();

  return <ImagePromptToolSections description={description} {...vm} />;
}
