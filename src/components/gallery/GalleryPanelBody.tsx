'use client';

import GalleryPanelDropZone from '@/components/gallery/GalleryPanelDropZone';
import GalleryPanelBodyContent from '@/components/gallery/GalleryPanelBodyContent';
import type { GalleryPanelBodyProps } from '@/components/gallery/gallery-panel-body-types';

export type {
  GalleryPanelBodyProps,
  GalleryPanelLightboxSlotProps,
} from '@/components/gallery/gallery-panel-body-types';

export default function GalleryPanelBody(props: GalleryPanelBodyProps) {
  return (
    <GalleryPanelDropZone {...props.upload}>
      <GalleryPanelBodyContent {...props} />
    </GalleryPanelDropZone>
  );
}
