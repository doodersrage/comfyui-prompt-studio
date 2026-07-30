import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { reviewGalleryImage } from '@/lib/gallery-vision-review';

export const runtime = 'nodejs';
export const maxDuration = 120;

function formatVisionReviewError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Vision review failed.';
  }
  if (error.message === 'fetch failed') {
    const cause = error.cause as { code?: string; message?: string } | undefined;
    const detail = cause?.code || cause?.message || 'network error';
    return `Cannot reach vision LLM (${detail}). Check LLM_API_BASE_URL / LM Studio.`;
  }
  return error.message;
}

export async function POST(request: Request) {
  let body: { imageDataUrl?: string; prompt?: string };
  try {
    body = (await request.json()) as {
      imageDataUrl?: string;
      prompt?: string;
    };
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  if (!body.imageDataUrl?.trim() || !body.prompt?.trim()) {
    return apiError('imageDataUrl and prompt are required.', 400);
  }
  try {
    const review = await reviewGalleryImage({
      imageDataUrl: body.imageDataUrl,
      prompt: body.prompt,
    });
    return apiJson(review);
  } catch (error) {
    const message = formatVisionReviewError(error);
    console.error('[gallery/vision-review]', message);
    return apiError(message, 500);
  }
}

export async function OPTIONS() {
  return apiMethodNotAllowed(['POST'], '/api/gallery/vision-review');
}
