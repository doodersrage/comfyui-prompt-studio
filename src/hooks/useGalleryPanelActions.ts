'use client';

export type {
  GalleryBulkExperimentHandlers,
  UseGalleryPanelActionsInput,
} from '@/hooks/gallery/gallery-panel-actions-types';
export { EMPTY_GALLERY_CARD_ACTIONS } from '@/hooks/gallery/useGalleryCardActions';

import type { UseGalleryPanelActionsInput } from '@/hooks/gallery/gallery-panel-actions-types';
import { useGalleryCardActions } from '@/hooks/gallery/useGalleryCardActions';
import { useGalleryBulkActions } from '@/hooks/gallery/useGalleryBulkActions';

export function useGalleryPanelActions(input: UseGalleryPanelActionsInput) {
  const galleryCardActionsRef = useGalleryCardActions(input);
  const bulkExperimentHandlers = useGalleryBulkActions(input);

  return { galleryCardActionsRef, bulkExperimentHandlers };
}
