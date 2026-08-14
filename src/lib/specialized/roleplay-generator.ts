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
  hasReferenceImage?: boolean;
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

function uncensoredAdultLine(content: RoleplayContentId): string {
  if (!isRoleplayAdultContent(content)) {
    return '';
  }
  return 'Uncensored. Do not sanitize, fade to black, refuse, hedge, or swap in a fully-clothed gag. Write the adult content this rating asks for. Consenting adults only. No minors.';
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
    return `Erotic NSFW. The still is about desire: skin, undress, lingerie or clothes coming off, body heat, sexual tension you can photograph. Describe cleavage, thighs, bare back, wet fabric, flushed skin, intimate distance. Not a polite portrait with a wink. ${gore} ${adults}`;
  }
  if (content === 'explicit') {
    return `Full explicit NSFW. Name nudity and sex as a readable tableau: genitals, breasts, ass, penetration, oral, hands on bodies, fluids, explicit pose. Be anatomical and specific — do not euphemize or cut away. ${gore} ${adults}`;
  }
  if (content === 'raunchy') {
    return `Raunchy sexual comedy. Crude, vulgar, graphic. The joke is sexual and on-camera (wardrobe malfunction, horny slapstick, explicit visual gag) — not a dirty one-liner over a clothed still. ${gore} ${adults}`;
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
  } else if (content === 'sultry') {
    rating =
      'Every option should be erotic: undress, skin, making out, grinding, a fuck-me look in a readable pose. Do not offer a tame fully-clothed branch.';
  } else if (content === 'explicit') {
    rating =
      'Every option should be sexually explicit: sex in progress, oral, nude posing, hands on genitals — named in the blurb so the still can show it.';
  } else if (content === 'raunchy') {
    rating =
      'Every option should be a crude sexual visual gag, not a clean joke with a dirty title.';
  }
  return `Do not repeat earlier story titles. ${rating} ${gore} No sexual content involving minors.`;
}

function promptStyleLine(content: RoleplayContentId, allowGore: boolean): string {
  if (allowGore && isRoleplayAdultContent(content)) {
    return 'Graphic adult and/or horrific, specific, visual. Gore may appear.';
  }
  if (allowGore) {
    return 'Specific, visual. Gore may appear as a readable horror tableau.';
  }
  if (content === 'explicit') {
    return 'Pornographic, anatomical, specific, visual. Show the sex.';
  }
  if (content === 'sultry') {
    return 'Erotic, skin-forward, specific, visual. Heat is the subject.';
  }
  if (content === 'raunchy') {
    return 'Vulgar sexual comedy, graphic, specific, visual.';
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
    return `${lookLock}, ${blurb}, explicit sex, nude bodies, anatomical detail, intimate lighting${gore}, readable scene`;
  }
  if (content === 'sultry') {
    return `${lookLock}, ${blurb}, erotic undress, bare skin, sultry low-key lighting, sexual pose${gore}, readable scene`;
  }
  if (content === 'raunchy') {
    return `${lookLock}, ${blurb}, crude sexual gag, explicit wardrobe fail, raunchy comedy lighting${gore}, readable scene`;
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

function adultLookHint(content: RoleplayContentId): string {
  if (content === 'explicit') {
    return ' For look: include body and sexual presentation (nude or mid-sex wardrobe), not just an outfit.';
  }
  if (content === 'sultry') {
    return ' For look: include skin, body, and how little they are wearing.';
  }
  if (content === 'raunchy') {
    return ' For look: include a sexually ridiculous wardrobe or body gag.';
  }
  return '';
}

function referenceLine(hasReferenceImage: boolean): string {
  return hasReferenceImage
    ? "A reference photo is provided. Keep THAT person/character's face and body. Costume and species from the part can overlay the photo — do not invent a different face."
    : '';
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
  const hasReferenceImage = Boolean(options.hasReferenceImage);
  const persona = resolveRoleplayPersonaPrompt(options.personaId, options.customPersona);
  const fallback = templateRoleplayBio(options.personaId, options.customPersona);
  const raw = await llmJson({
    llm: options.llm,
    maxTokens: 420,
    temperature: 0.95,
    system: `You invent a fun roleplay character for an image-generation game.
${toneLine(tone)}
${uncensoredAdultLine(content)}
${referenceLine(hasReferenceImage)}
Return ONLY JSON: {"name":"","look":"","personality":"","catchphrase":""}
- look: one visual sentence (species/body, clothes, colors, distinctive props).${adultLookHint(content)}${
      hasReferenceImage
        ? ' Describe the reference person as they appear, plus the costume/species overlay from the part.'
        : ''
    }
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
${uncensoredAdultLine(content)}
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
  const hasReferenceImage = Boolean(options.hasReferenceImage);

  return runSpecializedPrompt({
    model: options.model,
    detail: options.detail,
    toolInstructions: `You write a single image prompt for a roleplay still.
${toneLine(tone)}
${uncensoredAdultLine(content)}
${contentLine(content, allowGore)}
${referenceLine(hasReferenceImage)}
- The SAME character must appear: ${lookLock}
- Name (${bio.name}) can appear once; do not invent a new cast unless the beat requires one extra figure.
- Describe the chosen situation as a readable tableau: pose, props, setting, light, bodies.${
      hasReferenceImage
        ? '\n- This still is img2img from the reference photo: keep identity, change pose/scene/wardrobe as the beat requires.'
        : ''
    }
- If this is a first-look / establishing beat, make a character portrait in a fitting environment${
      isRoleplayAdultContent(content)
        ? ' that already matches the rating (skin, wardrobe state, sexual heat) — not a fully clothed yearbook photo'
        : ' — not a crowded plot'
    }.
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
      hasReferenceImage,
      bioName: bio.name,
      sceneTitle: situation.title,
      sceneBlurb: situation.blurb,
    },
  });
}
