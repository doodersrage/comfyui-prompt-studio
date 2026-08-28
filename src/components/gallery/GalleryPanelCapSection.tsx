'use client';

import GalleryCapCleanupWizard from '@/components/gallery/GalleryCapCleanupWizard';
import { GalleryCapWarningBanner } from '@/components/gallery/GalleryPanelChrome';
import type { ComfyGalleryEntry, ComfyGalleryFilter } from '@/lib/comfyui-gallery';
import type { GalleryCapWarningLevel } from '@/lib/gallery-cap';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';

type GalleryPanelCapSectionProps = {
  showFilters: boolean;
  galleryCapWarning: { level: GalleryCapWarningLevel; message: string | null };
  capWizardOpen: boolean;
  setCapWizardOpen: (open: boolean) => void;
  capEvictionPreview: ComfyGalleryEntry[];
  entriesLength: number;
  setFilter: (
    patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
  ) => void;
  exportCapKeepers: () => void;
  removeEntries: (ids: string[]) => void;
  setFavorites: (ids: string[], favorite: boolean) => void;
};

export default function GalleryPanelCapSection({
  showFilters,
  galleryCapWarning,
  capWizardOpen,
  setCapWizardOpen,
  capEvictionPreview,
  entriesLength,
  setFilter,
  exportCapKeepers,
  removeEntries,
  setFavorites,
}: GalleryPanelCapSectionProps) {
  const showAtRisk = () =>
    setFilter(previous => ({
      ...previous,
      atRiskOnly: true,
      favoritesOnly: undefined,
      minRating: undefined,
    }));

  return (
    <>
      {galleryCapWarning.message ? (
        <GalleryCapWarningBanner
          level={galleryCapWarning.level}
          message={galleryCapWarning.message}
          onShowAtRisk={showAtRisk}
          onExportKeepers={exportCapKeepers}
          onOpenCleanup={() => setCapWizardOpen(true)}
        />
      ) : null}

      {showFilters && capWizardOpen && capEvictionPreview.length > 0 ? (
        <GalleryCapCleanupWizard
          evicted={capEvictionPreview}
          max={MAX_GALLERY_ENTRIES}
          total={entriesLength}
          onShowAtRisk={() => {
            showAtRisk();
            setCapWizardOpen(false);
          }}
          onExportKeepers={exportCapKeepers}
          onDeleteEvicted={() => {
            if (
              window.confirm(
                `Delete ${capEvictionPreview.length} at-risk gallery entries? Keepers stay.`
              )
            ) {
              removeEntries(capEvictionPreview.map(entry => entry.id));
              setCapWizardOpen(false);
            }
          }}
          onFavoriteEvicted={() => {
            setFavorites(
              capEvictionPreview.map(entry => entry.id),
              true
            );
            setCapWizardOpen(false);
          }}
          onClose={() => setCapWizardOpen(false)}
        />
      ) : null}
    </>
  );
}
