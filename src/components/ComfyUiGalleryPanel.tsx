'use client';

import GalleryPanelBody from '@/components/gallery/GalleryPanelBody';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import { useGalleryPanelOrchestration } from '@/hooks/useGalleryPanelOrchestration';

type ComfyUiGalleryPanelProps = {
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
  showFilters?: boolean;
};

export default function ComfyUiGalleryPanel(props: ComfyUiGalleryPanelProps) {
  const { showSkeleton, skeletonProps, bodyProps } = useGalleryPanelOrchestration(props);

  if (showSkeleton) {
    return <GalleryPanelSkeleton {...skeletonProps} />;
  }

  return <GalleryPanelBody {...bodyProps!} />;
}
