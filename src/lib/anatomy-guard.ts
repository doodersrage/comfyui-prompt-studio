import type { ComfyImageModel } from './comfy-models/client';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { modelUsesNegativePrompt } from './prompt-pair';

export type AnatomyGuardMode = 'off' | 'standard' | 'strict';

export const DEFAULT_ANATOMY_GUARD_MODE: AnatomyGuardMode = 'standard';

export const ANATOMY_GUARD_OPTIONS: {
  id: AnatomyGuardMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'No anatomy steering on queue.',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Guards against extra limbs, mutations, and broken proportions.',
  },
  {
    id: 'strict',
    label: 'Strict',
    description: 'Stronger hand, finger, and limb guards for people and creatures.',
  },
];

const ANATOMY_POSITIVE_SUFFIX: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard: 'accurate anatomy, correct proportions, natural limb count, coherent body structure',
  strict:
    'accurate anatomy, correct proportions, natural limb count, anatomically correct hands and fingers, symmetrical features, coherent body structure',
};

const ANATOMY_NEGATIVE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'mutated, mutation, deformed, bad anatomy, extra limbs, extra arms, extra legs, missing limbs, disfigured, malformed, gross proportions',
  strict:
    'mutated, mutation, deformed, bad anatomy, extra limbs, extra arms, extra legs, missing limbs, disfigured, malformed, gross proportions, extra fingers, too many fingers, fused fingers, extra hands, duplicate limbs, wrong number of limbs, body horror, anatomical nonsense',
};

const FLUX_ANATOMY_AVOID: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'Avoid extra limbs, missing limbs, deformed anatomy, mutations, and broken proportions.',
  strict:
    'Avoid extra limbs, missing limbs, deformed anatomy, extra or fused fingers, duplicate hands, mutations, and broken proportions.',
};

/** Compact CFG-1 pack — Klein Distilled invents limbs/fingers often; keep cues short and concrete. */
const KLEIN_DISTILLED_ANATOMY_POSITIVE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'natural limb count, five fingers per hand, clear wrists, anatomically correct hands, coherent single body',
  strict:
    'exactly five separate fingers on each visible hand with visible knuckles and a natural thumb, clear wrists and elbows, anatomically correct hands, natural limb count, coherent single body, no overlapping or fused digits',
};

const KLEIN_DISTILLED_STRICT_HAND_FRONLOAD =
  'Each visible hand shows exactly five separate fingers with clear knuckles and a natural thumb—no extra, missing, or fused digits.';

const KLEIN_DISTILLED_ANATOMY_AVOID: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'Avoid extra limbs, missing limbs, extra or fused fingers, duplicate hands, and mutated anatomy.',
  strict:
    'Avoid extra limbs, missing limbs, extra or fused fingers, webbed or melted hands, duplicate hands, mutated anatomy, and body horror.',
};

/**
 * Hand-readability only — never prescribe a body pose (standing/walking used to
 * steamroll seated/reclining prompts on distilled Flux).
 */
const KLEIN_DISTILLED_POSE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard: '',
  strict:
    'When hands appear in frame, keep every finger separated and readable with visible knuckles; do not hide hands in fists, sleeves, or motion blur; do not invent extra limbs to support contact.',
};

function isKleinDistilledModel(model: ComfyImageModel | string): boolean {
  return model === 'flux-2-klein-4b-distilled' || model === 'flux-2-klein-9b-distilled';
}

function isKleinBaseModel(model: ComfyImageModel | string): boolean {
  return model === 'flux-2-klein' || model === 'flux-2-klein-9b';
}

const KLEIN_BASE_ANATOMY_POSITIVE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'anatomically correct hands with five distinct fingers, clear wrists, natural limb count, coherent body proportions',
  strict:
    'anatomically correct hands with five distinct fingers and visible knuckles, clear wrists and elbows, natural limb count, coherent body proportions, no overlapping or fused digits',
};

const KLEIN_BASE_POSE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'When hands are visible, keep five fingers distinct; avoid weight-bearing palm close-ups that crush digits.',
  strict:
    'When hands, faces, or full figures are visible, keep five-fingered hands readable—avoid fisheye distortion and palm-support close-ups that crush digits.',
};

const KLEIN_BASE_FISHEYE_HAND_CUE =
  'Use a normal rectangular full-frame lens read with anatomically correct five-fingered hands—avoid circular fisheye barrel distortion on the figure.';

const ULTRAREAL_ANATOMY_POSITIVE: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'anatomically correct hands with five distinct fingers, clear wrists, natural limb count, coherent body proportions',
  strict:
    'anatomically correct hands with five distinct fingers and visible knuckles, clear wrists and elbows, natural limb count, coherent body proportions, no fused or overlapping digits',
};

const ULTRAREAL_POSE_EXTRA: Record<Exclude<AnatomyGuardMode, 'off'>, string> = {
  standard:
    'When hands are visible, keep five fingers distinct; avoid clasped or weight-bearing palm close-ups that crush digits.',
  strict:
    'When hands, faces, or full figures are visible, keep five-fingered hands readable—avoid clasped-hand knots, palm-support close-ups, and fisheye distortion.',
};

function promptHasFisheyeOrCircularFrame(prompt: string): boolean {
  return /\b(fisheye|fish-eye|circular (?:vignette|frame|crop)|barrel distortion)\b/i.test(prompt);
}

function kleinBaseHasStrongHandAnatomy(prompt: string): boolean {
  return /\b(five distinct fingers|anatomically correct hands with five)\b/i.test(prompt);
}

function ultraRealHasStrongHandAnatomy(prompt: string): boolean {
  return /\b(five distinct fingers|anatomically correct hands with five)\b/i.test(prompt);
}

function kleinDistilledHasStrongAnatomy(prompt: string): boolean {
  return (
    /\b(five separate fingers|five distinct fingers|exactly five fingers|anatomically correct hands with five)\b/i.test(
      prompt
    ) && /\bavoid (?:extra limbs|extra or fused fingers|webbed or melted hands)\b/i.test(prompt)
  );
}

function kleinDistilledHasStrictHandFrontload(prompt: string): boolean {
  return /\b(exactly five separate fingers|five separate fingers with clear knuckles)\b/i.test(prompt);
}

/** Likely full figure or hand visibility — strict mode front-loads hand cues for Klein Distilled. */
function promptLikelyShowsHands(prompt: string): boolean {
  return /\b(hand|hands|finger|fingers|fist|grip|grasp|holding|waving|punch|kick|fighter|fighting|chun.?li|figure|person|woman|man|girl|boy|character|portrait|full.?body|cowboy.?shot|action pose|martial|boxer|dancer|model)\b/i.test(
    prompt
  );
}

function prependCueAfterFirstSentence(prompt: string, cue: string): string {
  const trimmed = prompt.trim();
  if (!trimmed || !cue.trim()) {
    return trimmed;
  }
  const sentenceBreak = trimmed.match(/^(.+?[.!?])\s+/);
  if (sentenceBreak) {
    return `${sentenceBreak[1]} ${cue.trim()} ${trimmed.slice(sentenceBreak[0].length)}`;
  }
  return `${cue.trim()} ${trimmed}`;
}

function kleinDistilledHasPoseGuidance(prompt: string): boolean {
  return /\b(when hands appear in frame|prefer simple standing|prefer a single subject in a simple standing)\b/i.test(
    prompt
  );
}

/** Prompt already names a body pose — do not append stance-steering that fights it. */
function promptHasExplicitPose(prompt: string): boolean {
  return /\b(sitting|seated|kneeling|kneels?|reclining|reclines?|lying|lies? (?:on|down)|crouching|squatting|dancing|running|jumping|leaning|bent over|bent-over|yoga|stretching|lounging|prone|supine|cross[- ]legged|lotus|fetal|straddling|mounting|riding|climbing|crawling|floating|suspended|hanging)\b/i.test(
    prompt
  );
}

function promptHasHandPoseGuidance(prompt: string): boolean {
  return /\b(when hands (?:are|appear)|keep five[- ]finger|keep fingers distinct|avoid (?:clasped|weight-bearing palm)|palm-support close-ups|keep poses straightforward)\b/i.test(
    prompt
  );
}

export function normalizeAnatomyGuardMode(value: unknown): AnatomyGuardMode {
  if (value === 'standard' || value === 'strict' || value === 'off') {
    return value;
  }
  return DEFAULT_ANATOMY_GUARD_MODE;
}

function mergeCommaList(base: string | undefined, extra: string): string {
  const parts = `${base ?? ''}, ${extra}`
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(part);
  }
  return merged.join(', ');
}

function promptAlreadyHasAnatomyCue(prompt: string): boolean {
  return /\b(accurate anatomy|anatomically correct|correct proportions|natural limb count|coherent body structure)\b/i.test(
    prompt
  );
}

function clipSuffixToBudget(suffix: string, maxAppendChars: number): string {
  if (suffix.length <= maxAppendChars) {
    return suffix;
  }
  return suffix
    .slice(0, maxAppendChars)
    .replace(/,\s*[^,]*$/, '')
    .replace(/[.!?]\s*$/, '')
    .trim();
}

export function applyAnatomyGuardToPositive(
  prompt: string,
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
  options?: { maxAppendChars?: number }
): string {
  const trimmed = prompt.trim();
  if (!trimmed || mode === 'off' || promptAlreadyHasAnatomyCue(trimmed)) {
    return trimmed;
  }

  const maxAppend = options?.maxAppendChars;
  if (typeof maxAppend === 'number' && maxAppend < 40) {
    return trimmed;
  }

  let suffix = ANATOMY_POSITIVE_SUFFIX[mode];
  if (typeof maxAppend === 'number') {
    suffix = clipSuffixToBudget(suffix, maxAppend);
    if (!suffix) {
      return trimmed;
    }
  }
  const separator = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${separator}${suffix}`;
}

export function applyAnatomyGuardToNegative(
  negative: string | undefined,
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE
): string | undefined {
  if (mode === 'off') {
    return negative?.trim() || undefined;
  }

  const merged = mergeCommaList(negative, ANATOMY_NEGATIVE_EXTRA[mode]);
  return merged || undefined;
}

function applyKleinDistilledAnatomyGuard(input: {
  positive: string;
  mode: Exclude<AnatomyGuardMode, 'off'>;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  let positive = input.positive.trim();
  const maxAppend = input.maxPositiveAppendChars;
  let remaining = typeof maxAppend === 'number' ? Math.max(0, maxAppend) : undefined;
  const hadStrongAnatomy = kleinDistilledHasStrongAnatomy(positive);

  // Strict: front-load hand language early — appended CFG-1 suffixes are weak on 4-step Klein.
  if (
    input.mode === 'strict' &&
    promptLikelyShowsHands(positive) &&
    !kleinDistilledHasStrictHandFrontload(positive)
  ) {
    positive = prependCueAfterFirstSentence(positive, KLEIN_DISTILLED_STRICT_HAND_FRONLOAD);
  }

  // Distilled often already says "accurate anatomy" yet still grows extra fingers —
  // require stronger hand/limb language before skipping.
  if (!hadStrongAnatomy) {
    if (typeof remaining !== 'number' || remaining >= 48) {
      let suffix = KLEIN_DISTILLED_ANATOMY_POSITIVE[input.mode];
      if (typeof remaining === 'number') {
        suffix = clipSuffixToBudget(suffix, remaining);
      }
      if (suffix) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${suffix}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  // Hand-readability only (strict) — never force standing/walking over the prompt's pose.
  const poseExtra = KLEIN_DISTILLED_POSE_EXTRA[input.mode];
  if (
    poseExtra &&
    !promptHasExplicitPose(positive) &&
    !kleinDistilledHasPoseGuidance(positive) &&
    (typeof remaining !== 'number' || remaining >= 48)
  ) {
    let pose = poseExtra;
    if (typeof remaining === 'number') {
      pose = clipSuffixToBudget(pose, remaining);
    }
    if (pose) {
      const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
      const before = positive.length;
      positive = `${positive}${separator}${pose}`;
      if (typeof remaining === 'number') {
        remaining = Math.max(0, remaining - (positive.length - before));
      }
    }
  }

  if (
    !hadStrongAnatomy &&
    !/\bavoid (?:extra limbs|extra or fused fingers)\b/i.test(positive) &&
    (typeof remaining !== 'number' || remaining >= 48)
  ) {
    let avoid = KLEIN_DISTILLED_ANATOMY_AVOID[input.mode];
    if (typeof remaining === 'number') {
      avoid = clipSuffixToBudget(avoid, remaining);
    }
    if (avoid) {
      const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
      positive = `${positive}${separator}${avoid}`;
    }
  }

  return { positive, negative: undefined };
}

export function applyAnatomyGuardForModel(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  mode?: AnatomyGuardMode;
  maxPositiveAppendChars?: number;
}): { positive: string; negative?: string } {
  const resolvedMode = input.mode ?? DEFAULT_ANATOMY_GUARD_MODE;
  if (resolvedMode === 'off') {
    return {
      positive: input.positive.trim(),
      negative: input.negative?.trim() || undefined,
    };
  }

  // Klein Distilled is CFG-1: use a compact hand/limb pack (standard already includes fingers).
  if (isKleinDistilledModel(input.model)) {
    return applyKleinDistilledAnatomyGuard({
      positive: input.positive,
      mode: resolvedMode,
      maxPositiveAppendChars: input.maxPositiveAppendChars,
    });
  }

  const baseLength = input.positive.trim().length;
  let positive = applyAnatomyGuardToPositive(input.positive, resolvedMode, {
    maxAppendChars: input.maxPositiveAppendChars,
  });
  let remaining =
    typeof input.maxPositiveAppendChars === 'number'
      ? Math.max(0, input.maxPositiveAppendChars - (positive.length - baseLength))
      : undefined;

  // Klein Base: hand anatomy is often ignored when cues are generic and late —
  // upgrade to five-finger language and keep poses simple.
  if (isKleinBaseModel(input.model)) {
    if (
      !kleinBaseHasStrongHandAnatomy(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let handCue = KLEIN_BASE_ANATOMY_POSITIVE[resolvedMode];
      if (typeof remaining === 'number') {
        handCue = clipSuffixToBudget(handCue, remaining);
      }
      if (handCue) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${handCue}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }

    if (
      !promptHasExplicitPose(positive) &&
      !promptHasHandPoseGuidance(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let pose = KLEIN_BASE_POSE_EXTRA[resolvedMode];
      if (typeof remaining === 'number') {
        pose = clipSuffixToBudget(pose, remaining);
      }
      if (pose) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${pose}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }

    if (
      promptHasFisheyeOrCircularFrame(positive) &&
      !/\bnormal rectangular full-frame\b/i.test(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let fisheyeCue = KLEIN_BASE_FISHEYE_HAND_CUE;
      if (typeof remaining === 'number') {
        fisheyeCue = clipSuffixToBudget(fisheyeCue, remaining);
      }
      if (fisheyeCue) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${fisheyeCue}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  // UltraReal: author notes hands are fragile — five-finger cues without stance overrides.
  if (isFluxFineTuneCheckpointModel(input.model)) {
    if (
      !ultraRealHasStrongHandAnatomy(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let handCue = ULTRAREAL_ANATOMY_POSITIVE[resolvedMode];
      if (typeof remaining === 'number') {
        handCue = clipSuffixToBudget(handCue, remaining);
      }
      if (handCue) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${handCue}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }

    if (
      !promptHasExplicitPose(positive) &&
      !promptHasHandPoseGuidance(positive) &&
      (typeof remaining !== 'number' || remaining >= 48)
    ) {
      let pose = ULTRAREAL_POSE_EXTRA[resolvedMode];
      if (typeof remaining === 'number') {
        pose = clipSuffixToBudget(pose, remaining);
      }
      if (pose) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${pose}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  if (modelUsesNegativePrompt(input.model)) {
    return {
      positive,
      negative: applyAnatomyGuardToNegative(input.negative, resolvedMode),
    };
  }

  const avoid = FLUX_ANATOMY_AVOID[resolvedMode];
  if (!/\bavoid extra limbs\b/i.test(positive)) {
    if (typeof remaining !== 'number' || remaining >= 40) {
      const avoidText =
        typeof remaining === 'number' ? clipSuffixToBudget(avoid, remaining) : avoid;
      if (avoidText) {
        const separator = /[.!?]$/.test(positive) ? ' ' : '. ';
        const before = positive.length;
        positive = `${positive}${separator}${avoidText}`;
        if (typeof remaining === 'number') {
          remaining = Math.max(0, remaining - (positive.length - before));
        }
      }
    }
  }

  return { positive, negative: undefined };
}

export function formatAnatomyGuardHint(
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
  model?: ComfyImageModel | string
): string {
  if (mode === 'off') {
    return 'Off — no anatomy guards on queue.';
  }
  const option = ANATOMY_GUARD_OPTIONS.find(entry => entry.id === mode) ?? ANATOMY_GUARD_OPTIONS[0];
  const base = `${option.label} — ${option.description}`;
  if (model && isKleinDistilledModel(model)) {
    if (mode === 'strict') {
      return `${base} Klein Distilled Strict front-loads hand cues when people are likely; 4-step CFG-1 may still fail on complex hands — Klein 9B Base or Gallery → Anatomy repair for fixes.`;
    }
    return `${base} Klein Distilled has limited hand fidelity at 4 steps — use Strict for stronger cues, or Klein 9B Base for full-body people.`;
  }
  return base;
}
