'use client';

import { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';
import MobilePlayToolSections from '@/components/mobile/MobilePlayToolSections';

export default function MobilePlayTool() {
  const vm = useMobilePlayToolOrchestration();
  if (!vm.mounted) return <p className="type-caption text-[var(--text-muted)]">Loading play…</p>;
  return <MobilePlayToolSections description="" {...vm} />;
}
