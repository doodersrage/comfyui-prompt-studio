'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import MobileDayToolSections from '@/components/mobile/MobileDayToolSections';

export default function MobileDayTool() {
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) {
    return <p className="type-caption text-[var(--text-muted)]">Loading day…</p>;
  }
  return <MobileDayToolSections {...vm} />;
}
