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
  formatRoleplayStoryDigest,
  isRoleplayAdultContent,
  lastRoleplayPlotBeat,
  mergeRoleplaySceneOptions,
  parseRoleplayBio,
  parseRoleplayScenes,
  resolveRoleplayPersonaPrompt,
  resolveRoleplayToneAndContent,
  templateRoleplayBio,
  templateRoleplayScenes,
  type RoleplayBio,
  type RoleplayContentId,
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
  content?: string;
  allowGore?: boolean;
  bio?: RoleplayBio;
  story?: RoleplayStoryBeat[];
  situation?: RoleplayScene;
};

function toneLine(tone: RoleplayTone): string {
  if (tone === 'cinematic') {
    return 'Tone: cinematic still — dramatic light, movie framing.';
  }
  if (tone === 'cozy') {
    return 'Tone: cozy and low-stakes — warm light, soft humor.';
  }
  if (tone === 'chaotic') {
    return 'Tone: chaotic bit — too many plots, physical comedy, still readable as one image.';
  }
  return 'Tone: silly — jokes, cartoon physics, committed nonsense.';
}

function goreLine(allowGore: boolean): string {
  return allowGore
    ? 'Gore is allowed (blood, wounds, viscera as a readable still). Fictional. No sexual content involving minors.'
    : 'No gore.';
}

function contentLine(content: RoleplayContentId, allowGore: boolean): string {
  const gore = goreLine(allowGore);
  const adults = 'Consenting adults only. No minors. No lore dumps.';
  if (content === 'clean') {
    return `All-ages. No innuendo, no sexual content, no revealing wardrobe. ${gore}`;
  }
  if (content === 'suggestive') {
    return `Suggestive but not explicit: heat, lingering looks, implied, fade to black. No explicit nudity or sex. ${gore} ${adults}`;
  }
  if (content === 'sultry') {
    return `Adult and specific. Sensual is welcome; wardrobe can be revealing. ${gore} ${adults}`;
  }
  if (content === 'explicit') {
    return `Explicit adult stills are allowed: nudity, sex, bodies, as a readable tableau. ${gore} ${adults}`;
  }
  if (content === 'raunchy') {
    return `Adult comedy: crude, vulgar, dirty jokes. Sex can be implied or slapstick; not necessarily pornographic unless the beat asks. ${gore} ${adults}`;
  }
  return allowGore
    ? `Weird and specific. PG-13 language except gore. ${gore} No lore dumps.`
    : `Keep it PG-13, weird, and specific. No lore dumps. ${gore}`;
}

function sceneGuard(content: RoleplayContentId, allowGore: boolean): string {
  const gore = allowGore ? 'Gore/horror stills are allowed.' : 'No gore.';
  let rating = 'Keep it PG-13.';
  if (content === 'clean') {
    rating = 'Keep it all-ages. No innuendo.';
  } else if (content === 'suggestive') {
    rating = 'Suggestive is ok; no explicit sex or full nudity.';
  } else if (isRoleplayAdultContent(content)) {
    rating = 'Adult content matching the chosen rating is allowed. Consenting adults only.';
  }
  return `Do not repeat earlier story titles. ${rating} ${gore} No sexual content involving minors.`;
}

function promptStyleLine(content: RoleplayContentId, allowGore: boolean): string {
  if (allowGore && isRoleplayAdultContent(content)) {
    return 'Adult or horrific, specific, visual. Gore may appear.';
  }
  if (allowGore) {
    return 'Specific, visual. Gore may appear as a readable horror tableau.';
  }
  if (content === 'explicit') {
    return 'Explicit, specific, visual.';
  }
  if (content === 'sultry') {
    return 'Sensual, specific, visual.';
  }
  if (content === 'raunchy') {
    return 'Crude comedy, specific, visual.';
  }
  if (content === 'suggestive') {
    return 'Charged but not explicit, specific, visual.';
  }
  if (content === 'clean') {
    return 'All-ages, specific, visual.';
  }
  return 'Playful, specific, visual.';
}

function templatePromptFallback(
  lookLock: string,
  blurb: string,
  tone: RoleplayTone,
  content: RoleplayContentId,
  allowGore: boolean
): string {
  const gore = allowGore ? ', blood and viscera as readable detail' : '';
  if (content === 'explicit') {
    return `${lookLock}, ${blurb}, explicit adult tableau, intimate lighting${gore}, readable scene`;
  }
  if (content === 'sultry') {
    return `${lookLock}, ${blurb}, sultry low-key lighting, intimate pose${gore}, readable scene`;
  }
  if (content === 'raunchy') {
    return `${lookLock}, ${blurb}, raunchy comedy lighting, crude visual gag${gore}, readable scene`;
  }
  if (content === 'suggestive') {
    return `${lookLock}, ${blurb}, charged lighting, teasing pose${gore}, readable scene`;
  }
  if (content === 'clean') {
    return `${lookLock}, ${blurb}, all-ages storybook lighting, fully clothed, expressive pose${gore}`;
  }
  return allowGore
    ? `${lookLock}, ${blurb}, ${tone} horror lighting, blood and viscera as readable detail, expressive pose`
    : `${lookLock}, ${blurb}, ${tone} storybook lighting, expressive pose, readable scene`;
}

function hasRoleplayPlot(story: RoleplayStoryBeat[] | undefined): boolean {
  return Boolean(lastRoleplayPlotBeat(story));
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
  const { tone, content } = resolveRoleplayToneAndContent(options.tone, options.content);
  const allowGore = Boolean(options.allowGore);
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
- ${contentLine(content, allowGore)}`,
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
  const { tone, content } = resolveRoleplayToneAndContent(options.tone, options.content);
  const allowGore = Boolean(options.allowGore);
  const bio = options.bio ?? templateRoleplayBio(options.personaId, options.customPersona);
  const continuing = hasRoleplayPlot(options.story);
  const fallback = templateRoleplayScenes(
    options.personaId,
    options.customPersona,
    options.story,
    bio.name
  );
  const raw = await llmJson({
    llm: options.llm,
    maxTokens: 700,
    temperature: continuing ? 0.86 : 1.05,
    system: `You write choose-your-own-adventure forks for an image roleplay.
${toneLine(tone)}
Return ONLY JSON: {"scenes":[{"title":"","blurb":""}]}
- Exactly 4 scenes. Titles 2–6 words. Blurbs one sentence, visual, actionable.
- Each option is a different way THIS character's story continues from the last chosen beat.
- Keep the same setting, props, and relationships unless a branch is clearly leaving that moment.
- Do not jump to an unrelated location or a new plot that ignores what just happened.
- Each beat should make a distinct still image of THIS character.
- ${sceneGuard(content, allowGore)}`,
    user: [
      formatRoleplayBio(bio),
      formatRoleplayStoryDigest(options.story),
      continuing
        ? 'The player just picked the last beat. Write four mutually exclusive next moments that follow from it.'
        : 'No plot yet. Write four opening options for this character.',
      options.extraHints?.trim() ? `Player notes: ${options.extraHints.trim()}` : '',
      options.avoidedTokensInstruction ?? '',
      continuing ? 'Four continuing scenes.' : 'Four opening scenes.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });
  if (!raw) {
    return { scenes: fallback, provider: 'template' };
  }
  const parsed = parseRoleplayScenes(extractJsonValue(raw));
  const scenes = mergeRoleplaySceneOptions(parsed, fallback, options.story);
  return {
    scenes: scenes.length > 0 ? scenes : fallback,
    provider: parsed.length > 0 ? 'llm' : 'template',
  };
}

export async function generateRoleplayPrompt(
  options: RoleplaySharedOptions
): Promise<ToolGenerateResult> {
  const { tone, content } = resolveRoleplayToneAndContent(options.tone, options.content);
  const allowGore = Boolean(options.allowGore);
  const bio = options.bio ?? templateRoleplayBio(options.personaId, options.customPersona);
  const situation = options.situation;
  if (!situation?.title?.trim()) {
    throw new Error('Pick a scene before generating a still.');
  }
  const persona = resolveRoleplayPersonaPrompt(options.personaId, options.customPersona);
  const lookLock = bio.look.trim();
  const styleLine = promptStyleLine(content, allowGore);

  return runSpecializedPrompt({
    model: options.model,
    detail: options.detail,
    toolInstructions: `You write a single image prompt for a roleplay still.
${toneLine(tone)}
${contentLine(content, allowGore)}
- The SAME character must appear: ${lookLock}
- Name (${bio.name}) can appear once; do not invent a new cast unless the beat requires one extra figure.
- Describe the chosen situation as a readable tableau: pose, props, setting, light.
- If this is a first-look / establishing beat, make a character portrait in a fitting environment — not a crowded plot.
- ${styleLine} No camera brand names, no quality-tag soup, no comic-book lettering.`,
    userMessage: [
      formatRoleplayBio(bio),
      formatRoleplayStoryDigest(options.story),
      `This beat: ${situation.title} — ${situation.blurb}`,
      'Keep continuity with the last chosen beats: same character, and the same setting/props unless this beat clearly moves.',
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
      templatePromptFallback(lookLock, situation.blurb, tone, content, allowGore),
    metadata: {
      tool: 'roleplay',
      personaId: options.personaId ?? null,
      tone,
      content,
      allowGore,
      bioName: bio.name,
      sceneTitle: situation.title,
      sceneBlurb: situation.blurb,
    },
  });
}
