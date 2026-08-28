'use client';

import { useQueueToolOrchestration } from '@/hooks/useQueueToolOrchestration';
import { useHubPageDescription } from '@/hooks/useToolPageDescription';
import QueueToolSections from '@/components/queue/QueueToolSections';

export default function QueueTool() {
  const description = useHubPageDescription('queue');
  const vm = useQueueToolOrchestration();

  return <QueueToolSections description={description} {...vm} />;
}
