import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { isolateSubjectOnWhiteBuffer } from '@/lib/isolate-subject-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_ISOLATE_BYTES = 24 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/isolate-subject');
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return apiError('Image file is required.', 400);
    }
    if (file.type && !file.type.startsWith('image/') && file.type !== 'application/octet-stream') {
      return apiError('Upload must be an image file.', 400);
    }
    if (file.size > MAX_ISOLATE_BYTES) {
      return apiError('Image must be 24MB or smaller.', 400);
    }
    if (file.size === 0) {
      return apiError('Image file is empty.', 400);
    }
    const png = await isolateSubjectOnWhiteBuffer(file);
    const body = new Uint8Array(png.byteLength);
    body.set(png);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not isolate the subject.', 500);
  }
}
