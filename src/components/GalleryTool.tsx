'use client';

'use client';

import dynamic from 'next/dynamic';
import GalleryImportSection from '@/components/GalleryImportSection';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';

const ComfyUiGalleryPanel = dynamic(() => import('@/components/ComfyUiGalleryPanel'), {
  ssr: false,
  loading: () => <GalleryPanelSkeleton showFilters />,
});

const ACCENT = 'neutral' as const;

export default function GalleryTool() {
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Gallery</ToolBadge>}
      title="ComfyUI Gallery"
      description={
        isSimple
          ? 'Browse and review outputs — use search and filters when you need to dig in.'
          : 'Browse outputs, review and compare variants, run experiments, and queue follow-up work from one place.'
      }
    >
      <ToolSetupBanner toolLabel="Gallery" />
      <ComfyUiGalleryPanel showFilters />
      <GalleryImportSection />
    </ToolLayout>
  );
}
