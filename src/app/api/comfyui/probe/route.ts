import { checkComfyUiHealth } from '@/lib/service-health';
import { normalizeComfyPoolUrlList } from '@/lib/comfyui-pool';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const [url] = normalizeComfyPoolUrlList(body.url ? [body.url] : []);
    if (!url) {
      return apiError('Enter a valid http(s) ComfyUI URL on an allowed host.', 400);
    }
    const health = await checkComfyUiHealth({ apiUrl: url });
    return apiJson(health);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Probe failed.', 500);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/probe');
}
