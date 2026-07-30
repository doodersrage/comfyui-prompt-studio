import { normalizePetPresetOptions, type PetPresetOptions } from '@/lib/pet-options';
import { generatePetPrompt } from '@/lib/specialized/pet-generator';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
import {
  normalizeBlockedLocations,
  normalizeRecentLocations,
  normalizeSharedGenerationOptions,
} from '@/lib/specialized/normalize';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type PetRequestBody = {
  model?: string;
  detail?: string;
  hints?: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  variationStrength?: number;
  presetOptions?: Partial<Record<keyof PetPresetOptions, string>>;
  recentLocations?: string[];
  blockedLocations?: string[];
  lockedLocation?: string;
  variationSeed?: string;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/pet');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PetRequestBody;
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);

    const result = await generatePetPrompt({
      ...shared,
      ...avoidance,
      hints: body.hints?.trim(),
      portraitStyle: body.portraitStyle,
      variationStrength: body.variationStrength,
      presetOptions: normalizePetPresetOptions(body.presetOptions),
      recentLocations: normalizeRecentLocations(body.recentLocations),
      blockedLocations: normalizeBlockedLocations(body.blockedLocations),
      lockedLocation: body.lockedLocation?.trim(),
      variationSeed: body.variationSeed?.trim(),
    });

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Pet generation failed.', 500);
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
