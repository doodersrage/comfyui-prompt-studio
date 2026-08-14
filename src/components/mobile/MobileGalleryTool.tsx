'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import GalleryUploadButton from '@/components/gallery/GalleryUploadButton';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import { recordCatalogBiasFromPrompt } from '@/lib/catalog-rating-bias';
import {
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { buildGalleryHandoff, saveGalleryHandoff } from '@/lib/gallery-handoff';
import {
  newCharacterPlateId,
  roleplayPatchFromPlate,
  upsertCharacterPlate,
} from '@/lib/mobile-studio';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function MobileGalleryTool() {
  const router = useRouter();
  const { storeReady, filteredEntries, setReviewRating } = useComfyUiGallery({
    status: 'completed',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo(
    () => filteredEntries.filter(entry => galleryEntryPrimaryThumbUrl(entry)).slice(0, 48),
    [filteredEntries]
  );
  const selected = entries.find(entry => entry.id === selectedId) ?? null;

  const openInPlay = (entry: ComfyGalleryEntry) => {
    const url = galleryEntryPrimaryViewUrl(entry) || galleryEntryPrimaryThumbUrl(entry);
    if (!url) {
      return;
    }
    const plate = {
      id: newCharacterPlateId(),
      name: (entry.tool || 'Gallery still').replace(/-/g, ' '),
      createdAt: Date.now(),
      originalUrl: url,
      isolatedUrl: url,
      isolated: false,
    };
    const mobile = loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE);
    saveToolSettings('mobileStudio', {
      ...mobile,
      plates: upsertCharacterPlate(mobile.plates, plate),
      activePlateId: plate.id,
    });
    const roleplay = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
    saveToolSettings('roleplay', { ...roleplay, ...roleplayPatchFromPlate(plate) });
    router.push('/m/play');
  };

  const openInCompose = (entry: ComfyGalleryEntry) => {
    saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
    router.push('/compose?from=gallery');
  };

  if (!storeReady) {
    return <p className="type-caption text-[var(--text-muted)]">Loading gallery…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Gallery</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Rate stills. Upload your own. Open one in Play or Compose.
        </p>
        <GalleryUploadButton className="ui-btn-secondary mt-2 px-3 py-2 text-xs" />
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border-subtle)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
          No completed stills yet. Upload a photo to start.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {entries.map(entry => {
            const thumb = galleryEntryPrimaryThumbUrl(entry);
            const active = entry.id === selectedId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
                className={[
                  'overflow-hidden rounded-2xl border text-left',
                  active
                    ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                    : 'border-[var(--border-subtle)]',
                ].join(' ')}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="aspect-square w-full object-cover" />
                ) : null}
                {entry.reviewRating ? (
                  <p className="px-2 py-1 text-xs text-[var(--text-muted)]">
                    {entry.reviewRating}★
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
          <p className="line-clamp-3 text-sm text-[var(--text-secondary)]">{selected.prompt}</p>
          <div className="flex flex-wrap gap-1.5">
            {RATINGS.map(rating => (
              <button
                key={rating}
                type="button"
                data-active={selected.reviewRating === rating ? 'true' : 'false'}
                className="ui-chip"
                onClick={() => {
                  setReviewRating(selected.id, rating);
                  recordCatalogBiasFromPrompt(selected.prompt, rating);
                }}
              >
                {rating}★
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="primary"
              size="sm"
              className="w-full justify-center"
              onClick={() => openInPlay(selected)}
            >
              Use in Play
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-center"
              onClick={() => openInCompose(selected)}
            >
              Compose
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
