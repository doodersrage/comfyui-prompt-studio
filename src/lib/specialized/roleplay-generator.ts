import { chatCompletion } from '../llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  resolveRequestTemplateFallback,
} from '../llm-request-options';
import { stripPromptArtifacts } from '../prompt-cleanup';
import {
  extractJsonValue,
  formatRoleplayBio,
  normalizeRoleplayTone,
  parseRoleplayBio,
  parseRoleplayScenes,
  resolveRoleplayPersonaPrompt,
  templateRoleplayBio,
  templateRoleplayScenes,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
  type RoleplayTone,
} from '../roleplay';
import { runSpecializedPrompt } from './runner';
import type { SharedGenerationOptions, ToolGenerateResult } from './types';

export type RoleplaySharedOptions = SharedGenerationOptions & {
  personaId?: string;
  customPersona?: string;
  extraHints?: string;
  tone?: string;
  bio?: RoleplayBio;
  story?: RoleplayStoryBeat[];
  situation?: RoleplayScene;
};

function toneLine(tone: RoleplayTone): string {
  if (tone === 'cinematic') {
    return 'Tone: cinematic still — dramatic light, movie framing, keep it playful not grim.';
  }
  if (tone === 'cozy') {
    return 'Tone: cozy and low-stakes — warm light, soft humor, nobody is in real danger.';
  }
  if (tone === 'chaotic') {
    return 'Tone: chaotic bit — too many plots, physical comedy, still readable as one image.';
  }
  if (tone === 'sultry') {
    return 'Tone: sultry / adult — heat, low light, lingering looks, bodies and wardrobe can be revealing. Consenting adults only. No minors, no gore.';
  }
  return 'Tone: silly — jokes, cartoon physics, committed nonsense.';
}

function contentLine(tone: RoleplayTone): string {
  if (tone === 'sultry') {
    return 'Adult and specific. Sensual is welcome. Consenting adults only. No minors, no gore, no lore dumps.';
  }
  return 'Keep it PG-13, weird, and specific. No lore dumps.';
}

function storyDigest(story: RoleplayStoryBeat[] | undefined): string {
  const recent = (story ?? []).slice(-6);
  if (recent.length === 0) {
    return 'Story so far: nothing yet — this is the opening beat.';
  }
  return `Story so far:\n${recent.map((beat, index) => `${index + 1}. ${beat.title} — ${beat.blurb}`).join('\n')}`;
}

async function llmJson(options: {
  system: string;
  user: string;
  llm?: SharedGenerationOptions['llm'];
  maxTokens: number;
  temperature: number;
}): Promise<string | null> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    return null;
  }
  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      model: resolveRequestLlmModel(options.llm),
      endpoint: resolveRequestLlmEndpoint(options.llm),
    });
    return stripPromptArtifacts(content).trim() || content.trim();
  } catch (error) {
    if (!resolveRequestTemplateFallback(options.llm)) {
      throw error;
    }
    return null;
  }
}

export async function generateRoleplayBio(
  options: RoleplaySharedOptions
): Promise<{ bio: RoleplayBio; provider: 'llm' | 'template' }> {
  const tone = normalizeRoleplayTone(options.tone);
  const persona = resolveRoleplayPersonaPrompt(options.personaId, options.customPersona);
  const fallback = templateRoleplayBio(options.personaId, options.customPersona);
  const raw = await llmJson({
    llm: options.llm,
    maxTokens: 420,
    temperature: 0.95,
    system: `You invent a fun roleplay character for an image-generation game.
${toneLine(tone)}
Return ONLY JSON: {"name":"","look":"","personality":"","catchphrase":""}
- look: one visual sentence (species/body, clothes, colors, distinctive props).
- personality: one or two sentences, first or close third person.
- ${contentLine(tone)}`,
    user: [
      `Play as: ${persona}`,
      options.extraHints?.trim() ? `Extra notes: ${options.extraHints.trim()}` : '',
      options.avoidedTokensInstruction ?? '',
      'Write the bio JSON now.',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  if (!raw) {
    return { bio: fallback, provider: 'template' };
  }
  return { bio: parseRoleplayBio(extractJsonValue(raw), fallback), provider: 'llm' };
}

export async function generateRoleplayScenes(
  options: RoleplaySharedOptions
): Promise<{ scenes: RoleplayScene[]; provider: 'llm' | 'template' }> {
  const tone = normalizeRoleplayTone(options.tone);
  const bio = options.bio ?? templateRoleplayBio(options.personaId, options.customPersona);
  const fallback = templateRoleplayScenes(options.personaId, options.customPersona);
  const raw = await llmJson({
    llm: options.llm,
    maxTokens: 700,
    temperature: 1.05,
    system: `You write branching story beats for an image roleplay.
${toneLine(tone)}
Return ONLY JSON: {"scenes":[{"title":"","blurb":""}]}
- Exactly 4 scenes. Titles 2–6 words. Blurbs one sentence, visual, actionable.
- Each beat should make a distinct still image of THIS character.
- Do not repeat earlier story titles. No gore, no cruelty, no minors.`,
    user: [
      formatRoleplayBio(bio),
      storyDigest(options.story),
      options.extraHints?.trim() ? `Player notes: ${options.extraHints.trim()}` : '',
      options.avoidedTokensInstruction ?? '',
      'Four new scenes.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });
  if (!raw) {
    return { scenes: fallback, provider: 'template' };
  }
  const scenes = parseRoleplayScenes(extractJsonValue(raw));
  return {
    scenes: scenes.length > 0 ? scenes : fallback,
    provider: scenes.length > 0 ? 'llm' : 'template',
  };
}

export async function generateRoleplayPrompt(
  options: RoleplaySharedOptions
): Promise<ToolGenerateResult> {
  const tone = normalizeRoleplayTone(options.tone);
  const bio = options.bio ?? templateRoleplayBio(options.personaId, options.customPersona);
  const situation = options.situation;
  if (!situation?.title?.trim()) {
    throw new Error('Pick a scene before generating a still.');
  }
  const persona = resolveRoleplayPersonaPrompt(options.personaId, options.customPersona);
  const lookLock = bio.look.trim();

  return runSpecializedPrompt({
    model: options.model,
    detail: options.detail,
    toolInstructions: `You write a single image prompt for a roleplay still.
${toneLine(tone)}
- The SAME character must appear: ${lookLock}
- Name (${bio.name}) can appear once; do not invent a new cast unless the beat requires one extra figure.
- Describe the chosen situation as a readable tableau: pose, props, setting, light.
- If this is a first-look / establishing beat, make a character portrait in a fitting environment — not a crowded plot.
- ${tone === 'sultry' ? 'Sensual, specific, visual.' : 'Playful, specific, visual.'} No camera brand names, no quality-tag soup, no comic-book lettering.`,
    userMessage: [
      formatRoleplayBio(bio),
      storyDigest(options.story),
      `This beat: ${situation.title} — ${situation.blurb}`,
      options.extraHints?.trim() ? `Player notes: ${options.extraHints.trim()}` : '',
      options.avoidedTokensInstruction ?? '',
      'Write only the image prompt.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    sanitizeInput: [persona, situation.title, options.extraHints].filter(Boolean).join(' '),
    temperature: options.llm?.temperature ?? (tone === 'cozy' ? 0.7 : 0.95),
    allowTemplateFallback: options.llm?.allowTemplateFallback,
    llmModel: options.llm?.llmModel,
    llmEnabled: options.llm?.llmEnabled,
    llmProvider: options.llm?.llmProvider,
    llmApiKey: options.llm?.llmApiKey,
    templateFallback: () =>
      tone === 'sultry'
        ? `${lookLock}, ${situation.blurb}, sultry low-key lighting, intimate pose, readable scene`
        : `${lookLock}, ${situation.blurb}, ${tone} storybook lighting, expressive pose, readable scene`,
    metadata: {
      tool: 'roleplay',
      personaId: options.personaId ?? null,
      tone,
      bioName: bio.name,
      sceneTitle: situation.title,
      sceneBlurb: situation.blurb,
    },
  });
}
