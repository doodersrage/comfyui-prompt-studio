'use client';

import { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import MoodboardToolSections from '@/components/moodboard/MoodboardToolSections';

export default function MoodboardTool() {
  const description = useToolPageDescription(
    'Stack reference tiles, extract a look pack for Fitting / Day, or queue one scene still.',
    'Moodboard → look pack or scene still.'
  );
  const vm = useMoodboardToolOrchestration();
  if (!vm.mounted) return null;
  return <MoodboardToolSections description={description} {...vm} />;
}
