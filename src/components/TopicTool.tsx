'use client';

import { useTopicToolOrchestration } from '@/hooks/useTopicToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import TopicToolSections from '@/components/topic/TopicToolSections';

export default function TopicTool() {
  const description = useToolPageDescription(
    'Generate topic lists, batch-build prompts, or queue in bulk.',
    'Generate topics and batch prompts — expand batch options when you need them.'
  );
  const vm = useTopicToolOrchestration();
  if (!vm.mounted) return null;
  return <TopicToolSections description={description} {...vm} />;
}
