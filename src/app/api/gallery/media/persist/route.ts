import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { GALLERY_THUMB_WIDTH } from '@/lib/comfyui-outputs';
import {
  persistGalleryThumbFile,
  persistIdentityFile,
  persistGalleryOriginalFile,
} from '@/lib/gallery-media-store';
import { isServerStorageEnabled } from '@/lib/server-storage';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from '@/lib/url-safety';

export const runtime = 'nodejs';

function resolveMediaUserId(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

async function fetchComfyViewBuffer(input: {
  comfyUrl?: string;
  filename: string;
  subfolder: string;
  type: 'output' | 'input' | 'temp';
}): Promise<{ buffer: Buffer; contentType: string }> {
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: input.comfyUrl,
  });
  const comfyUrl = getComfyUiBaseUrl(runtime);
  const viewUrl = new URL(`${comfyUrl}/view`);
  viewUrl.searchParams.set('filename', input.filename);
  viewUrl.searchParams.set('subfolder', input.subfolder);
  viewUrl.searchParams.set('type', input.type);
  const response = await fetch(viewUrl.toString(), {
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
  });
  if (!response.ok) {
    throw new Error(`ComfyUI view returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? 'image/png';
  if (!contentType.startsWith('image/')) {
    throw new Error('ComfyUI view did not return an image.');
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}

async function encodeThumbWebp(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .rotate()
    .resize({
      width: GALLERY_THUMB_WIDTH,
      height: GALLERY_THUMB_WIDTH,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer();
}

type PersistJsonBody = {
  kind?: string;
  galleryEntryId?: string;
  comfyUrl?: string;
  filename?: string;
  subfolder?: string;
  type?: string;
  engineId?: string;
};

const MAX_GALLERY_UPLOAD_BYTES = 25 * 1024 * 1024;

async function persistUploadedOriginal(request: Request, form: FormData): Promise<NextResponse> {
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const entryId = String(form.get('galleryEntryId') ?? '').trim();
  if (!entryId) {
    return apiError('galleryEntryId is required.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof Blob) || file.size === 0) {
    return apiError('Image file is required.', 400);
  }
  if (file.size > MAX_GALLERY_UPLOAD_BYTES) {
    return apiError('Image is too large (max 25MB).', 413);
  }
  const filename =
    (typeof form.get('filename') === 'string' && form.get('filename')?.toString().trim()) ||
    (file instanceof File ? file.name : 'upload.png');
  const contentType = file.type || 'application/octet-stream';
  if (!contentType.startsWith('image/') && !/\.(jpe?g|png|webp|gif)$/i.test(filename)) {
    return apiError('Only image files can be added to the gallery.', 400);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const original = persistGalleryOriginalFile({
    userId,
    entryId,
    buffer,
    contentType,
    filename,
  });
  const thumb = await encodeThumbWebp(buffer);
  const storedThumb = persistGalleryThumbFile({ userId, entryId, buffer: thumb });
  return apiJson({
    url: `/api/gallery/media/${encodeURIComponent(entryId)}`,
    originalUrl: `/api/gallery/media/${encodeURIComponent(entryId)}?variant=original`,
    path: storedThumb.relativePath,
    originalPath: original.relativePath,
  });
}

async function persistFromViewParams(
  request: Request,
  kind: 'thumb' | 'identity',
  body: PersistJsonBody
): Promise<NextResponse> {
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  if (body.engineId && body.engineId !== 'comfyui') {
    return apiJson({ skipped: true, reason: 'engine' });
  }
  const filename = sanitizeComfyViewFilename(body.filename ?? '');
  const subfolder = sanitizeComfyViewSubfolder(body.subfolder ?? '');
  const type = normalizeComfyViewType(body.type?.trim() || 'output');
  const fetched = await fetchComfyViewBuffer({
    comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
    filename,
    subfolder,
    type,
  });
  if (kind === 'identity') {
    persistIdentityFile({
      userId,
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      filename,
    });
    return apiJson({
      url: '/api/gallery/media/identity',
      path: `identity/${userId || '_global'}/lock`,
    });
  }
  const entryId = body.galleryEntryId?.trim();
  if (!entryId) {
    return apiError('galleryEntryId is required.', 400);
  }
  const thumb = await encodeThumbWebp(fetched.buffer);
  const stored = persistGalleryThumbFile({ userId, entryId, buffer: thumb });
  return apiJson({
    url: `/api/gallery/media/${encodeURIComponent(entryId)}`,
    path: stored.relativePath,
  });
}

export async function POST(request: Request) {
  if (!isServerStorageEnabled()) {
    return apiJson({ skipped: true, reason: 'storage-disabled' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const userId = resolveMediaUserId(request);
      if (isAuthEnabled() && !userId) {
        return apiError('Sign in required.', 401);
      }
      const form = await request.formData();
      const kind = String(form.get('kind') ?? 'identity');
      if (kind === 'original') {
        return await persistUploadedOriginal(request, form);
      }
      if (kind !== 'identity') {
        return apiError('Multipart persist only supports identity or original.', 400);
      }
      const file = form.get('file');
      if (!(file instanceof Blob) || file.size === 0) {
        return apiError('Identity file is required.', 400);
      }
      const filename =
        (typeof form.get('filename') === 'string' && form.get('filename')?.toString().trim()) ||
        (file instanceof File ? file.name : 'identity.png');
      const buffer = Buffer.from(await file.arrayBuffer());
      persistIdentityFile({
        userId,
        buffer,
        contentType: file.type || 'application/octet-stream',
        filename,
      });
      return apiJson({
        url: '/api/gallery/media/identity',
        path: `identity/${userId || '_global'}/lock`,
      });
    }

    const body = (await request.json()) as PersistJsonBody;
    const kind = body.kind === 'identity' ? 'identity' : 'thumb';
    return await persistFromViewParams(request, kind, body);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Persist failed.', 502);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/media/persist');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
