'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';

const GalleryTool = dynamic(() => import('@/components/GalleryTool'), {
  ssr: false,
  loading: () => <GalleryPanelSkeleton showFilters />,
});

export default function GalleryPage() {
  return (
    <PageCanvas accent="neutral">
      <Suspense fallback={<GalleryPanelSkeleton showFilters />}>
        <GalleryTool />
      </Suspense>
    </PageCanvas>
  );
}
