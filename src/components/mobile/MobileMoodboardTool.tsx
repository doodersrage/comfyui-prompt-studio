'use client';

import { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import MobileMoodboardToolSections from '@/components/mobile/MobileMoodboardToolSections';

export default function MobileMoodboardTool() {
  const vm = useMoodboardToolOrchestration();
  if (!vm.mounted) {
    return <p className="type-caption text-[var(--text-muted)]">Loading moodboard…</p>;
  }
  return <MobileMoodboardToolSections {...vm} />;
}
