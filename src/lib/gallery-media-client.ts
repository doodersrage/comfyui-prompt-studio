import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { resolveComfyOutputMediaKind } from './comfyui-outputs';

export const IDENTITY_MEDIA_URL = '/api/gallery/media/identity';

export function isIdentityMediaUrl(url: string): boolean {
  const path = url.trim().split('?')[0] ?? '';
  return path === IDENTITY_MEDIA_URL || path.endsWith('/api/gallery/media/identity');
}

/** Identity persist always rewrites one lock file — bust so <img> does not keep the previous decode. */
export function cacheBustIdentityMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  const [path, query = ''] = trimmed.split('?');
  if (!isIdentityMediaUrl(path)) {
    return trimmed;
  }
  const params = new URLSearchParams(query);
  params.set('v', String(Date.now()));
  return `${path}?${params.toString()}`;
}

export function durableGalleryThumbUrl(entryId: string): string {
  return `/api/gallery/media/${encodeURIComponent(entryId)}`;
}

type PersistResponse = {
  skipped?: boolean;
  url?: string;
  path?: string;
  error?: string;
};

async function readPersistResponse(response: Response): Promise<PersistResponse | null> {
  if (!response.ok) {
    return null;
  }
  try {
    return (await response.json()) as PersistResponse;
  } catch {
    return null;
  }
}

/** Best-effort: copy the still's first image into durable storage. */
export async function persistGalleryThumb(
  entry: Pick<ComfyGalleryEntry, 'id' | 'comfyUrl' | 'engineId' | 'images'>
): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  const image = entry.images?.[0];
  if (!image?.filename?.trim()) {
    return null;
  }
  if (resolveComfyOutputMediaKind(image) !== 'image') {
    return null;
  }
  try {
    const response = await fetch('/api/gallery/media/persist', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'thumb',
        galleryEntryId: entry.id,
        comfyUrl: entry.comfyUrl,
        filename: image.filename,
        subfolder: image.subfolder ?? '',
        type: image.type ?? 'output',
        engineId: entry.engineId,
      }),
    });
    const data = await readPersistResponse(response);
    if (!data || data.skipped || !data.url) {
      return null;
    }
    return data.url;
  } catch {
    return null;
  }
}

/** Best-effort: store the locked-face bytes under PROMPT_DATA_DIR. */
export async function persistIdentityImage(input: {
  file?: Blob;
  filename?: string;
  galleryEntryId?: string;
  comfyUrl?: string;
  imageFilename?: string;
  subfolder?: string;
  type?: string;
}): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    let response: Response;
    if (input.file) {
      const body = new FormData();
      body.set('kind', 'identity');
      const name = input.filename?.trim() || 'identity.png';
      body.set('file', input.file, name);
      body.set('filename', name);
      response = await fetch('/api/gallery/media/persist', {
        method: 'POST',
        credentials: 'same-origin',
        body,
      });
    } else {
      response = await fetch('/api/gallery/media/persist', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'identity',
          galleryEntryId: input.galleryEntryId,
          comfyUrl: input.comfyUrl,
          filename: input.imageFilename,
          subfolder: input.subfolder ?? '',
          type: input.type ?? 'output',
        }),
      });
    }
    const data = await readPersistResponse(response);
    if (!data || data.skipped || !data.url) {
      return null;
    }
    return cacheBustIdentityMediaUrl(data.url);
  } catch {
    return null;
  }
}
