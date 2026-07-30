import { buildModelsPayload } from '@/lib/api/catalog';
import { apiError, apiJson, apiMethodNotAllowed, requestBaseUrl } from '@/lib/api/response';
import { COMFY_MODEL_CATEGORIES, type ComfyModelCategory } from '@/lib/comfy-models';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseCategory(value: string | null): ComfyModelCategory | null {
  if (!value) {
    return null;
  }
  return COMFY_MODEL_CATEGORIES.some(entry => entry.id === value)
    ? (value as ComfyModelCategory)
    : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() || null;
  const categoryParam = url.searchParams.get('category')?.trim() || null;
  const category = parseCategory(categoryParam);

  if (categoryParam && !category) {
    return apiError('Unknown category.', 400, {
      category: categoryParam,
      validCategories: COMFY_MODEL_CATEGORIES.map(entry => entry.id),
    });
  }

  const payload = buildModelsPayload({ category, id });

  if ('found' in payload && !payload.found) {
    return apiError('Unknown model id.', 404, {
      id: payload.id,
      modelsUrl: `${requestBaseUrl(request)}/api/models`,
    });
  }

  if ('found' in payload && payload.found) {
    return apiJson({ model: payload.model });
  }

  return apiJson(payload);
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/models');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
