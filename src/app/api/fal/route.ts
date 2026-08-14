import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { queueFalImage } from '@/lib/fal-client';
import { DEFAULT_FAL_IMG2IMG_MODEL, DEFAULT_FAL_TXT2IMG_MODEL } from '@/lib/engine/capabilities';

export const runtime = 'nodejs';
export const maxDuration = 60;

type FalRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  falApiKey?: string;
  clientId?: string;
  hasInputImage?: boolean;
  inputImageFilename?: string;
  params?: {
    seed?: string | number;
    width?: string | number;
    height?: string | number;
    steps?: string | number;
    cfg?: string | number;
    denoise?: string | number;
  };
};

function toNumber(value: string | number | undefined, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/fal');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FalRequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return apiError('Prompt is required.', 400);
    }

    const params = body.params ?? {};
    const seedRaw = params.seed;
    const seed =
      seedRaw === undefined || seedRaw === '' || seedRaw === -1 || seedRaw === '-1'
        ? null
        : Math.trunc(toNumber(seedRaw, 0) ?? 0);

    const imageFilename = body.hasInputImage === true ? body.inputImageFilename?.trim() : undefined;
    const denoise = toNumber(params.denoise);

    const result = await queueFalImage({
      prompt,
      negativePrompt: body.negativePrompt?.trim() || undefined,
      model: body.model?.trim() || DEFAULT_FAL_TXT2IMG_MODEL,
      img2imgModel: body.img2imgModel?.trim() || DEFAULT_FAL_IMG2IMG_MODEL,
      apiKey: body.falApiKey,
      width: toNumber(params.width, 1024),
      height: toNumber(params.height, 1024),
      steps: toNumber(params.steps),
      cfg: toNumber(params.cfg),
      seed,
      strength: denoise,
      imageFilename,
    });

    if (!result.ok || !result.promptId) {
      const missingKey = /fal api key/i.test(result.error ?? '');
      return apiError(result.error ?? 'Fal queue failed.', result.status || 502, {
        engineId: 'fal',
        engineUrl: result.engineUrl,
        href: missingKey ? '/settings?tab=comfyui&section=inference-engine' : undefined,
      });
    }

    return apiJson({
      ok: true,
      promptId: result.promptId,
      clientId: body.clientId?.trim() || undefined,
      engineId: 'fal',
      engineUrl: result.engineUrl,
      comfyUrl: result.engineUrl,
      workflowSource: 'fal',
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Fal queue failed.', 502);
  }
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
