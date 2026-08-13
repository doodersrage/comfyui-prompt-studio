import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { installComfyUiMissingNodePacks } from '@/lib/comfyui-manager-install';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { comfyUrl?: string; nodeTypes?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const nodeTypes = Array.isArray(body.nodeTypes)
    ? body.nodeTypes.filter((item): item is string => typeof item === 'string')
    : [];
  if (nodeTypes.length === 0) {
    return apiError('nodeTypes is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const result = await installComfyUiMissingNodePacks({
    baseUrl,
    classTypes: nodeTypes,
  });
  if (!result.ok && result.missingManager) {
    return apiError(result.error ?? 'ComfyUI-Manager is not available.', 501, {
      missingManager: true,
      unresolved: result.unresolved,
    });
  }
  if (!result.ok) {
    return apiError(result.error ?? 'Custom node install failed.', 502, {
      unresolved: result.unresolved,
      installed: result.installed,
    });
  }
  return apiJson({
    ok: true,
    installed: result.installed,
    unresolved: result.unresolved,
    restartNeeded: result.restartNeeded,
  });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/manager/install');
}
