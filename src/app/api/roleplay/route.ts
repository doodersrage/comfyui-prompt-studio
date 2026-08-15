import {
  generateRoleplayBio,
  generateRoleplayPrompt,
  generateRoleplayScenes,
} from '@/lib/specialized/roleplay-generator';
import { resolveAvoidanceOptions } from '@/lib/avoidance-options';
import { normalizeSharedGenerationOptions } from '@/lib/specialized/normalize';
import { enrichGenerateResult } from '@/lib/generation-diagnostics';
import {
  parseRoleplayAllowGore,
  parseRoleplayBio,
  parseRoleplayScenes,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';

export const runtime = 'nodejs';

type RoleplayAction = 'bio' | 'scenes' | 'prompt';

type RoleplayRequestBody = {
  action?: RoleplayAction;
  model?: string;
  detail?: string;
  personaId?: string;
  customPersona?: string;
  characterName?: string;
  extraHints?: string;
  setting?: string;
  lockedLocation?: string;
  tone?: string;
  content?: string;
  allowGore?: boolean;
  hasReferenceImage?: boolean;
  isolatedSubject?: boolean;
  bio?: RoleplayBio;
  story?: RoleplayStoryBeat[];
  rejectedScenes?: RoleplayScene[];
  situation?: RoleplayScene;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
  llmProvider?: string;
  llmApiKey?: string;
};

function parseAction(value: unknown): RoleplayAction {
  if (value === 'bio' || value === 'scenes' || value === 'prompt') {
    return value;
  }
  return 'prompt';
}

function parseStory(raw: unknown): RoleplayStoryBeat[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(entry => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const blurb = typeof record.blurb === 'string' ? record.blurb.trim() : title;
      const id = typeof record.id === 'string' ? record.id.trim() : title;
      const at =
        typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now();
      if (!title) {
        return null;
      }
      return { id: id || title, title, blurb, at };
    })
    .filter((entry): entry is RoleplayStoryBeat => Boolean(entry))
    .slice(-12);
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/roleplay');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RoleplayRequestBody;
    const action = parseAction(body.action);
    const shared = normalizeSharedGenerationOptions(body);
    const avoidance = resolveAvoidanceOptions(body);
    const common = {
      ...shared,
      ...avoidance,
      personaId: body.personaId?.trim(),
      customPersona: body.customPersona?.trim(),
      characterName: body.characterName?.trim(),
      extraHints: body.extraHints?.trim(),
      setting: body.setting?.trim() || body.lockedLocation?.trim(),
      lockedLocation: body.lockedLocation?.trim(),
      tone: body.tone,
      content: body.content,
      allowGore: parseRoleplayAllowGore(body.allowGore),
      hasReferenceImage: body.hasReferenceImage === true,
      isolatedSubject: body.hasReferenceImage === true && body.isolatedSubject === true,
      bio: body.bio ? parseRoleplayBio(body.bio) : undefined,
      story: parseStory(body.story),
      rejectedScenes: parseRoleplayScenes(body.rejectedScenes),
    };

    if (action === 'bio') {
      const result = await generateRoleplayBio(common);
      return apiJson(result);
    }

    if (action === 'scenes') {
      const result = await generateRoleplayScenes(common);
      return apiJson(result);
    }

    const situation = body.situation ? parseRoleplayScenes([body.situation])[0] : undefined;
    const result = await generateRoleplayPrompt({ ...common, situation });
    return apiJson(
      enrichGenerateResult(
        result,
        [common.extraHints, common.setting, situation?.title].filter(Boolean).join(' ')
      )
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Roleplay generation failed.', 500);
  }
}

export function OPTIONS() {
  return apiOptions();
}
