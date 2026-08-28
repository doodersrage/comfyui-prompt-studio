'use client';

import Link from 'next/link';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { isAssembledFilmEntry } from '@/lib/character-film';
import {
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { isGalleryClipEntry } from '@/lib/roleplay-film';

export default function CharacterMediaTile({
  entry,
  characterId,
  kept,
  onToggleKeeper,
  onAnimateStill,
  onRemoveFromCharacter,
}: {
  entry: ComfyGalleryEntry;
  characterId: string;
  kept?: boolean;
  onToggleKeeper?: () => void;
  onAnimateStill?: () => void;
  onRemoveFromCharacter?: () => void;
}) {
  const previewSrc = galleryEntryHeroPreviewUrl(entry);
  const clip = isGalleryClipEntry({
    ...entry,
    mediaKind: galleryEntryPrimaryMediaKind(entry),
  });
  const href = `/gallery?character=${encodeURIComponent(characterId)}&focus=${encodeURIComponent(entry.id)}`;
  return (
    <li>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]">
        {clip && previewSrc ? (
          <GalleryEntryPreview
            entry={entry}
            className="aspect-square w-full object-cover"
            controls
          />
        ) : (
          <Link href={href} className="block">
            {previewSrc ? (
              <GalleryEntryPreview entry={entry} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center type-caption text-[var(--text-muted)]">
                {entry.status}
              </div>
            )}
          </Link>
        )}
        <p className="type-caption truncate px-2 py-1 text-[var(--text-muted)]">
          {isAssembledFilmEntry(entry) ? 'Film' : clip ? 'Clip' : 'Still'}
          {kept ? ' · keeper' : ''}
          {entry.reviewRating ? ` · ${entry.reviewRating}★` : ''}
          {entry.favorite ? ' · fav' : ''}
          {clip ? (
            <>
              {' · '}
              <Link href={href} className="underline-offset-2 hover:underline">
                Open
              </Link>
            </>
          ) : null}
          {!clip && onAnimateStill ? (
            <>
              {' · '}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={onAnimateStill}
              >
                Animate
              </button>
            </>
          ) : null}
          {!clip && onToggleKeeper ? (
            <>
              {' · '}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={onToggleKeeper}
              >
                {kept ? 'Drop keeper' : 'Keep'}
              </button>
            </>
          ) : null}
          {onRemoveFromCharacter ? (
            <>
              {' · '}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={onRemoveFromCharacter}
              >
                Remove
              </button>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}
