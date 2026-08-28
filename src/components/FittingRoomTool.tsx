'use client';

import { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import FittingRoomToolSections from '@/components/fitting/FittingRoomToolSections';

export default function FittingRoomTool() {
  const description = useToolPageDescription(
    'Lock a Cast plate, swipe catalog kits with draft thumbs, queue outfit try-on stills.',
    'Try outfits on a Cast character — swipe kits on a locked plate with draft previews.'
  );
  const vm = useFittingRoomToolOrchestration();
  if (!vm.mounted) return null;
  return <FittingRoomToolSections description={description} {...vm} />;
}
