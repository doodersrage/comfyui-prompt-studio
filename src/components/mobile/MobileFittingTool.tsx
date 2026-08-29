'use client';

import { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import MobileFittingToolSections from '@/components/mobile/MobileFittingToolSections';

export default function MobileFittingTool() {
  const vm = useFittingRoomToolOrchestration();
  if (!vm.mounted) {
    return <p className="type-caption text-[var(--text-muted)]">Loading fitting…</p>;
  }
  return <MobileFittingToolSections {...vm} />;
}
