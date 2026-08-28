'use client';

import type { ReactNode } from 'react';
import type { GalleryPanelUploadProps } from '@/components/gallery/gallery-panel-body-types';

type GalleryPanelDropZoneProps = GalleryPanelUploadProps & {
  children: ReactNode;
};

export default function GalleryPanelDropZone({
  importDroppedImages,
  children,
}: GalleryPanelDropZoneProps) {
  return (
    <section
      className="space-y-6"
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
        }
      }}
      onDrop={event => {
        const files = [...event.dataTransfer.files];
        if (files.length === 0) {
          return;
        }
        event.preventDefault();
        void importDroppedImages(files);
      }}
    >
      {children}
    </section>
  );
}
