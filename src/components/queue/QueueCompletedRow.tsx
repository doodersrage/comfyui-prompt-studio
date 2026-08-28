'use client';

import { buildGalleryFocusUrl } from '@/lib/use-as-hints-url';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { ButtonLink } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

export default function QueueCompletedRow({ entry }: { entry: ComfyGalleryEntry }) {
  const galleryHref = buildGalleryFocusUrl(entry.id);
  return (
    <li className="ui-list-row items-center gap-3">
      <GalleryEntryPreview entry={entry} className="h-12 w-12 rounded object-cover" />
      <div className="ui-list-primary min-w-0">
        <p className="truncate text-sm text-[var(--text-secondary)]">{entry.prompt}</p>
        <p className="type-caption">
          {entry.status} · {entry.model}
        </p>
      </div>
      <ButtonLink href={galleryHref} size="sm" variant="secondary">
        Open in Gallery
      </ButtonLink>
    </li>
  );
}
