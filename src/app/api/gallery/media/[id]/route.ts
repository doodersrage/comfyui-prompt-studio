import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { readGalleryThumbFile } from '@/lib/gallery-media-store';
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
  try {
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
