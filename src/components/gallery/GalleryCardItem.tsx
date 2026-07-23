"use client";

import { memo, useCallback } from "react";
import GalleryCard from "@/components/gallery/GalleryCard";
import {
  galleryEntryRenderKey,
  type ComfyGalleryEntry,
  type GalleryLayoutMode,
} from "@/lib/comfyui-gallery";
import {
  canFaceDetailGalleryEntry,
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
  galleryEntrySupportsSoftSecondPass,
  galleryEntrySupportsUpscale,
} from "@/lib/gallery-entry-actions";

export type GalleryCardActions = {
  toggleSelected: (id: string) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  requeue: (
    id: string,
    newSeed: boolean,
    qualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile,
  ) => void;
  cancel: (id: string) => void;
  upscale: (
    id: string,
    qualityProfile: "final" | "max",
    options?: { force?: boolean },
  ) => void;
  refine: (id: string) => void;
  softSecondPass: (id: string) => void;
  faceDetail: (id: string) => void;
  moireClean: (
    id: string,
    qualityProfile: "final" | "max",
    options?: { force?: boolean },
  ) => void;
  showParent: (id: string) => void;
  showDerivatives: (id: string) => void;
  openImage: (id: string, index: number) => void;
  reviewRating: (id: string, rating: ComfyGalleryEntry["reviewRating"]) => void;
  downloadError: (message: string | null) => void;
  visionTagClick: (tag: string) => void;
  viewWorkflow: (id: string) => void;
  pick?: (id: string) => void;
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
  hasDerivatives?: boolean;
  pickMode?: boolean;
  pickable?: boolean;
  pickLabel?: string;
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
  hasDerivatives,
  pickMode = false,
  pickable = false,
  pickLabel,
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
  const onUpscale = useCallback(
    (qualityProfile: "final" | "max", options?: { force?: boolean }) =>
      actionsRef.current.upscale(entry.id, qualityProfile, options),
    [actionsRef, entry.id],
  );
  const onRefine = useCallback(
    () => actionsRef.current.refine(entry.id),
    [actionsRef, entry.id],
  );
  const onSoftSecondPass = useCallback(
    () => actionsRef.current.softSecondPass(entry.id),
    [actionsRef, entry.id],
  );
  const onFaceDetail = useCallback(
    () => actionsRef.current.faceDetail(entry.id),
    [actionsRef, entry.id],
  );
  const onMoireClean = useCallback(
    (qualityProfile: "final" | "max", options?: { force?: boolean }) =>
      actionsRef.current.moireClean(entry.id, qualityProfile, options),
    [actionsRef, entry.id],
  );
  const onShowParent = useCallback(() => {
    actionsRef.current.showParent(entry.id);
  }, [actionsRef, entry.id]);
  const onShowDerivatives = useCallback(() => {
    actionsRef.current.showDerivatives(entry.id);
  }, [actionsRef, entry.id]);
  const onRequeue = useCallback(
    (
      newSeed: boolean,
      qualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile,
    ) => actionsRef.current.requeue(entry.id, newSeed, qualityProfile),
    [actionsRef, entry.id],
  );
  const onCancel = useCallback(
    () => actionsRef.current.cancel(entry.id),
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
  const onPick = useCallback(
    () => actionsRef.current.pick?.(entry.id),
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
      onCancel={onCancel}
      onUpscale={onUpscale}
      onRefine={onRefine}
      onSoftSecondPass={onSoftSecondPass}
      onFaceDetail={onFaceDetail}
      onMoireClean={onMoireClean}
      showUpscaleActions={galleryEntrySupportsUpscale(entry.model)}
      showUpscaleFinal={canUpscaleGalleryEntry(entry, "final")}
      showUpscaleMax={canUpscaleGalleryEntry(entry, "max")}
      showForceUpscaleMax={
        galleryEntrySupportsUpscale(entry.model) &&
        entry.status === "completed" &&
        galleryEntryAlreadyEnrichedForUpscale(entry, "max")
      }
      showRefineAction={galleryEntrySupportsRefine(entry.model)}
      showSoftSecondPassAction={galleryEntrySupportsSoftSecondPass(entry.model)}
      showFaceDetailAction={canFaceDetailGalleryEntry(entry)}
      showMoireCleanActions={galleryEntrySupportsMoireClean(entry.model)}
      showMoireCleanFinal={
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === "completed" &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, "final")
      }
      showMoireCleanMax={
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === "completed" &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, "max")
      }
      showForceMoireCleanMax={
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === "completed" &&
        galleryEntryAlreadyEnrichedForUpscale(entry, "max")
      }
      onShowParent={entry.parentGalleryEntryId ? onShowParent : undefined}
      onShowDerivatives={hasDerivatives ? onShowDerivatives : undefined}
      hasDerivatives={hasDerivatives}
      onOpenImage={onOpenImage}
      reviewMode={reviewMode}
      reviewMutationHints={reviewMutationHints}
      onVisionTagClick={onVisionTagClick}
      onReviewRating={onReviewRating}
      onViewWorkflow={onViewWorkflow}
      pickMode={pickMode}
      pickable={pickable}
      pickLabel={pickLabel}
      onPick={pickMode ? onPick : undefined}
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
    previous.hasDerivatives === next.hasDerivatives &&
    previous.pickMode === next.pickMode &&
    previous.pickable === next.pickable &&
    previous.pickLabel === next.pickLabel &&
    previous.imageUrls.length === next.imageUrls.length &&
    previous.imageUrls[0] === next.imageUrls[0]
  );
}

export default memo(GalleryCardItem, propsEqual);
