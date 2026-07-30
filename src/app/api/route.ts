import { buildApiCatalog } from '@/lib/api/catalog';
import { apiJson, apiMethodNotAllowed, requestBaseUrl } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const baseUrl = requestBaseUrl(request);
  return apiJson(buildApiCatalog(baseUrl));
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api');
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
