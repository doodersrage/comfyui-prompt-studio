'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import DayPlannerToolSections from '@/components/day-planner/DayPlannerToolSections';

export default function DayPlannerTool() {
  const description = useToolPageDescription(
    'Plan morning through night, queue stills, then Cut a day-in-the-life reel.',
    'Character day — four slots → stills → Cut film.'
  );
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) return null;
  return <DayPlannerToolSections description={description} {...vm} />;
}
