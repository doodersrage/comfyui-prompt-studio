import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { queueReplicateImage } from '@/lib/replicate-client';
import {
  DEFAULT_REPLICATE_IMG2IMG_MODEL,
  DEFAULT_REPLICATE_TXT2IMG_MODEL,
  cloudSettingsHref,
} from '@/lib/engine/capabilities';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ReplicateRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  replicateApiToken?: string;
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
  return apiMethodNotAllowed(['POST'], '/api/replicate');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReplicateRequestBody;
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
    const result = await queueReplicateImage({
      prompt,
      negativePrompt: body.negativePrompt?.trim() || undefined,
      model: body.model?.trim() || DEFAULT_REPLICATE_TXT2IMG_MODEL,
      img2imgModel: body.img2imgModel?.trim() || DEFAULT_REPLICATE_IMG2IMG_MODEL,
      apiToken: body.replicateApiToken,
      width: toNumber(params.width, 1024),
      height: toNumber(params.height, 1024),
      steps: toNumber(params.steps),
      cfg: toNumber(params.cfg),
      seed,
      strength: toNumber(params.denoise),
      imageFilename,
    });

    if (!result.ok || !result.promptId) {
      const missingKey = /replicate api token/i.test(result.error ?? '');
      return apiError(result.error ?? 'Replicate queue failed.', result.status || 502, {
        engineId: 'replicate',
        engineUrl: result.engineUrl,
        href: missingKey ? cloudSettingsHref() : undefined,
      });
    }

    return apiJson({
      ok: true,
      promptId: result.promptId,
      clientId: body.clientId?.trim() || undefined,
      engineId: 'replicate',
      engineUrl: result.engineUrl,
      comfyUrl: result.engineUrl,
      workflowSource: 'replicate',
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Replicate queue failed.', 502);
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
