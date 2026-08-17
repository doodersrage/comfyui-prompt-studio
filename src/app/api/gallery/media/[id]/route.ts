import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { contentTypeForViewBytes } from '@/lib/comfyui-outputs';
import { readGalleryOriginalFile, readGalleryThumbFile } from '@/lib/gallery-media-store';
import { isServerStorageEnabled } from '@/lib/server-storage';

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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage is disabled.', 404);
  }
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const { id } = await context.params;
  const variant = new URL(request.url).searchParams.get('variant')?.trim() || 'thumb';
  try {
    if (variant === 'original') {
      const original = readGalleryOriginalFile({ userId, entryId: id });
      if (original) {
        const filename = original.filename?.replace(/[\r\n"]+/g, '') || 'original';
        const contentType = contentTypeForViewBytes(
          filename,
          original.contentType,
          original.buffer
        );
        return new NextResponse(new Uint8Array(original.buffer), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
          },
        });
      }
    }
    const file = readGalleryThumbFile({ userId, entryId: id });
    if (!file) {
      return apiError('Durable thumb not found.', 404);
    }
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid gallery id.', 400);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/gallery/media/[id]');
}
