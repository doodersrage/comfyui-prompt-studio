import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { requestComfyUiRestart } from '@/lib/comfyui-restart';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const result = await requestComfyUiRestart(baseUrl);
  if (!result.ok) {
    return apiError(result.error, result.missingManager ? 501 : 502, {
      missingManager: result.missingManager ?? false,
    });
  }
  return apiJson({ ok: true, via: result.via });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/restart');
}
