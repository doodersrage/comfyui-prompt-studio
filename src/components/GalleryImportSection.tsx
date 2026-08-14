'use client';

import dynamic from 'next/dynamic';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const GalleryImportTools = dynamic(() => import('@/components/GalleryImportTools'), {
  loading: () => <ToolPageSkeleton label="Loading import tools" />,
});

export default function GalleryImportSection() {
  return (
    <CollapsibleSection
      title="Import & queue tools"
      summary="Stills, sidecar, PNG, ComfyUI history"
      defaultOpen={false}
      persistKey="gallery-import"
    >
      <GalleryImportTools />
    </CollapsibleSection>
  );
}
