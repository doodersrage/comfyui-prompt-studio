"use client";

import { memo, useCallback } from "react";
import GalleryCard from "@/components/gallery/GalleryCard";
import {
  galleryEntryRenderKey,
  type ComfyGalleryEntry,
  type GalleryLayoutMode,
} from "@/lib/comfyui-gallery";

export type GalleryCardActions = {
  toggleSelected: (id: string) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  requeue: (id: string, newSeed: boolean) => void;
  openImage: (id: string, index: number) => void;
  reviewRating: (id: string, rating: ComfyGalleryEntry["reviewRating"]) => void;
  downloadError: (message: string | null) => void;
  visionTagClick: (tag: string) => void;
  viewWorkflow: (id: string) => void;
};

type GalleryCardItemProps = {
  entry: ComfyGalleryEntry;
  actionsRef: React.RefObject<GalleryCardActions>;
  compact: boolean;
  layout: GalleryLayoutMode;
  selectable: boolean;
  selected: boolean;
  reviewFocus: boolean;
  previewUrl: string | null;
  imageUrls: string[];
  reviewMode: boolean;
  reviewMutationHints?: string[];
};

function GalleryCardItem({
  entry,
  actionsRef,
  compact,
  layout,
  selectable,
  selected,
  reviewFocus,
  previewUrl,
  imageUrls,
  reviewMode,
  reviewMutationHints,
}: GalleryCardItemProps) {
  const onToggleSelected = useCallback(
    () => actionsRef.current.toggleSelected(entry.id),
    [actionsRef, entry.id],
  );
  const onRemove = useCallback(
    () => actionsRef.current.remove(entry.id),
    [actionsRef, entry.id],
  );
  const onToggleFavorite = useCallback(
    () => actionsRef.current.toggleFavorite(entry.id),
    [actionsRef, entry.id],
  );
  const onRequeue = useCallback(
    (newSeed: boolean) => actionsRef.current.requeue(entry.id, newSeed),
    [actionsRef, entry.id],
  );
  const onOpenImage = useCallback(
    (index: number) => actionsRef.current.openImage(entry.id, index),
    [actionsRef, entry.id],
  );
  const onReviewRating = useCallback(
    (rating: ComfyGalleryEntry["reviewRating"]) => {
      if (rating) {
        actionsRef.current.reviewRating(entry.id, rating);
      }
    },
    [actionsRef, entry.id],
  );
  const onDownloadError = useCallback(
    (message: string | null) => actionsRef.current.downloadError(message),
    [actionsRef],
  );
  const onVisionTagClick = useCallback(
    (tag: string) => actionsRef.current.visionTagClick(tag),
    [actionsRef],
  );
  const onViewWorkflow = useCallback(
    () => actionsRef.current.viewWorkflow(entry.id),
    [actionsRef, entry.id],
  );

  return (
    <GalleryCard
      entry={entry}
      compact={compact}
      layout={layout}
      selectable={selectable}
      selected={selected}
      reviewFocus={reviewFocus}
      onToggleSelected={onToggleSelected}
      previewUrl={previewUrl}
      imageUrls={imageUrls}
      onRemove={onRemove}
      onToggleFavorite={onToggleFavorite}
      onDownloadError={onDownloadError}
      onRequeue={onRequeue}
      onOpenImage={onOpenImage}
      reviewMode={reviewMode}
      reviewMutationHints={reviewMutationHints}
      onVisionTagClick={onVisionTagClick}
      onReviewRating={onReviewRating}
      onViewWorkflow={onViewWorkflow}
    />
  );
}

function propsEqual(
  previous: GalleryCardItemProps,
  next: GalleryCardItemProps,
): boolean {
  return (
    galleryEntryRenderKey(previous.entry) === galleryEntryRenderKey(next.entry) &&
    previous.selected === next.selected &&
    previous.reviewFocus === next.reviewFocus &&
    previous.previewUrl === next.previewUrl &&
    previous.compact === next.compact &&
    previous.layout === next.layout &&
    previous.selectable === next.selectable &&
    previous.reviewMode === next.reviewMode &&
    previous.reviewMutationHints === next.reviewMutationHints &&
    previous.imageUrls.length === next.imageUrls.length &&
    previous.imageUrls[0] === next.imageUrls[0]
  );
}

export default memo(GalleryCardItem, propsEqual);
