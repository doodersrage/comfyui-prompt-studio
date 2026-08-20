type VariationPools = {
  subjects: string[];
  lighting: string[];
  framing: string[];
  atmosphere: string[];
  palette: string[];
  styles: string[];
  eras: string[];
  lenses: string[];
  twists: string[];
  reinterpretations: string[];
  mandates: string[];
};

const POOLS: VariationPools = {
  subjects: [
    'an elderly man with a creased face, silver stubble, and work-worn hands',
    'a young Black woman with box braids, high cheekbones, and gold hoop earrings',
    'a middle-aged Latina with gray-streaked hair, soft build, and laugh lines',
    'a tall androgynous person with a shaved side, sharp jawline, and a worn leather jacket',
    'a teenage East Asian boy with messy hair, freckles, and a shy half-smile',
    'an older South Asian woman in a bright sari, gentle eyes, and henna on her palms',
    'a muscular Polynesian man with traditional arm tattoos and sun-darkened skin',
    'a pale red-haired woman in her thirties, light dusting of freckles, cropped copper hair',
    'a stocky Mediterranean man with olive skin, thick beard, and rolled shirtsleeves',
    'a slender elderly woman with white hair in a loose bun, reading glasses, and steady posture',
    'a young nonbinary person with dyed teal undercut, angular features, and layered jewelry',
    'a heavyset middle-aged man with a bald head, warm expression, and paint-stained apron',
    'a lithe dancer in her twenties, deep brown skin, locs tied back, expressive hands',
    'a grizzled fisherman with rope-scarred fingers, salt-and-pepper beard, and squinting eyes',
    'a school-age girl with braids, gap-toothed grin, and scuffed sneakers',
    'a wheelchair user with sharp features, buzzed hair, and a vintage bomber jacket',
    'a pregnant woman in her late thirties, curly auburn hair, linen dress, calm focus',
    'a street vendor with sun-creased skin, quick hands, and a stained apron',
    'a retired boxer with a flattened nose, gray temples, and quiet stillness',
    'a monk with a shaved head, deep brown robes, and ink-stained fingers',
  ],
  lighting: [
    'harsh midday sun casting crisp, short shadows',
    'soft overcast light with muted contrast',
    'golden-hour backlight with warm rim glow',
    'cool blue moonlight and deep shadow pools',
    'a single warm practical light source with falloff into darkness',
    'neon color spill mixing magenta and cyan across surfaces',
    'dappled light filtering through leaves or lattice',
    'storm-light with bruised purple clouds and sudden highlights',
    'candlelight flicker with warm amber pools on nearby surfaces',
    'early-morning fog diffusing pale sunlight',
    'sodium-vapor streetlight green cast on wet pavement',
    'lightning flash freezing motion for a split second',
    'projector light cutting through haze and dust',
    'underwater caustics rippling across surfaces',
  ],
  framing: [
    'a wide establishing view with layered depth',
    'a low angle looking upward for scale and drama',
    'a tight close framing on hands, face, or a key object',
    'an over-the-shoulder view opening into the scene beyond',
    'a slightly off-center asymmetric composition',
    "a bird's-eye perspective looking down into the space",
    'a three-quarter view with strong foreground-to-background separation',
    'a symmetrical centered composition with balanced negative space',
    'a Dutch tilt that adds unease and motion',
    'extreme foreground obstruction with the subject beyond',
  ],
  atmosphere: [
    'quiet and contemplative',
    'charged with restless energy',
    'humid and heavy',
    'crisp and wind-swept',
    'dreamlike and slightly surreal',
    'gritty and lived-in',
    'serene and suspended in time',
    'tense, as if a moment before something happens',
    'celebratory and bright',
    'melancholic but beautiful',
    'electric and unpredictable',
    'sacred and hushed',
  ],
  palette: [
    'rust, cream, and deep teal',
    'charcoal, silver, and a single red accent',
    'sun-faded ochre, sage, and dusty rose',
    'electric violet, acid green, and midnight blue',
    'warm amber, burnt sienna, and shadow brown',
    'ice blue, pale lavender, and soft white',
    'terracotta, olive, and sun-bleached sand',
    'ink black, pearl gray, and molten gold highlights',
    'copper, plum, and smoke gray',
    'lime, coral, and deep indigo',
  ],
  styles: [
    'documentary realism with unposed candid energy',
    'painterly impressionism with visible brushstroke logic',
    'cinematic widescreen still with anamorphic depth',
    'gritty street photography with grain and contrast',
    'soft romantic illustration with flowing edges',
    'hyper-detailed editorial fashion energy',
    'noir with crushed blacks and selective highlights',
    'surrealist dream logic with impossible scale shifts',
    'retro pulp cover boldness',
    'intimate indie film stillness',
  ],
  eras: [
    'a 1970s texture of film grain and faded warmth',
    'a near-future layer of worn tech and patched fabrics',
    'a 1920s elegance of art deco lines and polished surfaces',
    'a post-apocalyptic salvage aesthetic',
    'a timeless mythic past with no exact century',
    'a 1990s suburban mundane interrupted by something strange',
    'a colonial-era frontier roughness',
    'a solarpunk optimism of greenery and reclaimed materials',
  ],
  lenses: [
    'shot on a wide 24mm lens with environmental context',
    'compressed telephoto flattening layers at 85mm',
    'macro intimacy on a small telling detail',
    'fisheye distortion wrapping the space',
    'shallow depth of field isolating one sharp plane',
    'deep focus keeping foreground and horizon crisp',
  ],
  twists: [
    'a flock of paper birds caught mid-flight',
    'an obsolete object that should not belong there',
    'weather that contradicts the setting',
    'a mirror or window doubling the scene',
    'bioluminescence where none is expected',
    'evidence of a recent unseen event',
    'scale play—something tiny made monumental',
    'a stray animal behaving oddly',
    'architecture bleeding into nature',
    'light from two incompatible sources',
  ],
  reinterpretations: [
    'a mundane slice-of-life version of the topic',
    'a mythic or folkloric version of the topic',
    'a sci-fi reframing of the topic',
    'a horror-tinged version of the topic',
    'a tender romantic version of the topic',
    'a chaotic action-fragment version of the topic',
    'a minimalist version with few objects but strong mood',
    'a maximalist version overflowing with specific clutter',
  ],
  mandates: [
    'Push beyond the obvious first interpretation of the keywords.',
    'Surprise the viewer with at least one detail they would not expect.',
    'Avoid the most clichéd visual solution to this topic.',
    'Change the focal subject from what you would normally choose first.',
    'Open the description with an unusual detail, not a generic establishing line.',
    'Let one color or texture dominate unexpectedly.',
    'Make the scene feel like a specific place, not a stock backdrop.',
    'Give any person a specific job, habit, or tell visible in the frame.',
  ],
};

function randomInt(max: number): number {
  if (max <= 0) return 0;
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)]!;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export type SubjectGender = 'women' | 'men' | 'mixed' | 'any';

const SUBJECTS_WOMEN = [
  'a young Black woman with box braids, high cheekbones, and gold hoop earrings',
  'a middle-aged Latina with gray-streaked hair, soft build, and laugh lines',
  'a pale red-haired woman in her thirties, light freckles, and cropped copper hair',
  'a slender elderly woman with white hair in a loose bun, reading glasses, and steady posture',
  'an older South Asian woman in a bright sari, gentle eyes, and henna on her palms',
  'a lithe dancer in her twenties, deep brown skin, locs tied back, and expressive hands',
  'a pregnant woman in her late thirties, curly auburn hair, linen dress, and calm focus',
  'a school-age girl with braids, a gap-toothed grin, and scuffed sneakers',
];

const SUBJECTS_MEN = [
  'an elderly man with a creased face, silver stubble, and work-worn hands',
  'a teenage East Asian boy with messy hair, freckles, and a shy half-smile',
  'a muscular Polynesian man with traditional arm tattoos and sun-darkened skin',
  'a stocky Mediterranean man with olive skin, thick beard, and rolled shirtsleeves',
  'a heavyset middle-aged man with a bald head, warm expression, and paint-stained apron',
  'a grizzled fisherman with rope-scarred fingers, salt-and-pepper beard, and squinting eyes',
  'a retired boxer with a flattened nose, gray temples, and quiet stillness',
  'a monk with a shaved head, deep brown robes, and ink-stained fingers',
];

const MINIMAL_HAIR_PATTERN = /\b(bald|balding|shaved|buzzed|monk|tonsure|hairless)\b/i;

const IDENTITY_WOMEN = [
  'a young Black woman with box braids, high cheekbones, warm brown eyes, and gold hoop earrings',
  'a middle-aged Latina with gray-streaked hair, soft build, and laugh lines',
  'a pale red-haired woman in her thirties, light freckles, and cropped copper hair',
  'a slender elderly woman with white hair in a loose bun, reading glasses, and steady posture',
  'an older South Asian woman with silver-streaked hair, gentle eyes, and henna on her palms',
  'a lithe woman in her twenties with deep brown skin, locs tied back, and expressive hands',
  'a woman in her late thirties with curly auburn hair, focused eyes, and strong cheekbones',
  'a woman in her forties with sharp cheekbones, dark curls, and amber eyes',
];

const IDENTITY_MEN = [
  'an elderly man with a creased face, silver stubble, and work-worn hands',
  'a teenage East Asian man with messy hair, freckles, and a shy half-smile',
  'a muscular Polynesian man with traditional arm tattoos and sun-darkened skin',
  'a stocky Mediterranean man with olive skin, thick beard, and square jaw',
  'a heavyset middle-aged man with a bald head, warm expression, and laugh lines',
  'a grizzled man with rope-scarred fingers, salt-and-pepper beard, and squinting eyes',
  'a retired boxer with a flattened nose, gray temples, and quiet stillness',
  'a man in his thirties with close-cropped hair, sharp jawline, and steady gaze',
];

const ATHLETIC_IDENTITY_EXCLUDE =
  /\b(?:pregnant|school-age|child|kid|toddler|infant|monk|nun|girl with|boy with|elderly|older|retired|teenage|teen\b|grizzled|reading glasses)\b/i;

const ATHLETIC_COMPETITION_IDENTITY_WOMEN = [
  'a young Black woman with box braids, high cheekbones, warm brown eyes, and an endurance-toned build',
  'a Latina woman in her thirties with dark wavy hair, strong jaw, and sun-warmed skin',
  'a pale red-haired woman in her thirties, light freckles, and cropped copper hair',
  'an East Asian woman in her twenties with a sleek black ponytail, sharp cheekbones, and focused eyes',
  'a South Asian woman in her late twenties with a long braid, warm brown eyes, and defined cheekbones',
  "a white woman in her forties with sun-weathered skin, a blonde braid, and crow's-feet at the eyes",
  'a mixed-race woman in her twenties with curly dark hair, amber eyes, and an athletic frame',
  'an Indigenous woman in her thirties with thick black hair in twin braids and high cheekbones',
  'a Middle Eastern woman in her twenties with olive skin, dark curls, and steady gaze',
  'a Nordic woman in her thirties with fair skin, ice-blue eyes, and closely cropped sides',
  'a Black woman in her forties with close-cropped natural hair, bold cheekbones, and a powerful jaw',
  'a Southeast Asian woman in her late twenties with tan skin, a short dark bob, and bright eyes',
  'a Mediterranean woman in her early thirties with chestnut waves, olive skin, and angular features',
  'a woman in her late thirties with curly auburn hair, focused eyes, and strong cheekbones',
];

const ATHLETIC_COMPETITION_IDENTITY_MEN = [
  'a Black man in his thirties with close-cropped hair, high cheekbones, and a lean endurance build',
  'a Latino man in his late twenties with dark curls, square jaw, and sun-bronzed skin',
  'a white man in his thirties with sandy blond stubble, gray-green eyes, and a rangy build',
  'an East Asian man in his twenties with messy black hair, sharp jawline, and alert eyes',
  'a South Asian man in his thirties with thick dark hair, warm brown skin, and steady gaze',
  'a Polynesian man in his late twenties with traditional arm tattoos, broad shoulders, and sun-darkened skin',
  'a Mediterranean man in his thirties with olive skin, thick beard, and a compact powerful frame',
  'a mixed-race man in his twenties with tight curls, hazel eyes, and long-limbed posture',
  'a Middle Eastern man in his early thirties with dark stubble, strong nose, and intent eyes',
  'a Nordic man in his thirties with pale skin, cropped blond hair, and sharp cheekbones',
  'a Southeast Asian man in his late twenties with tan skin, short black hair, and defined jaw',
  "a man in his forties with salt-and-pepper temples, weathered smile lines, and a wiry racer's build",
  'a stocky man in his thirties with a shaved head, brown eyes, and thick neck muscles',
  'a lean man in his twenties with a sharp jawline, auburn buzz cut, and freckles across his nose',
];

export function pickDistinctIdentitySeeds(
  count: number,
  gender: SubjectGender = 'any',
  options: { allowMinimalHair?: boolean; athletic?: boolean } = {}
): string[] {
  if (gender === 'mixed' && count >= 2) {
    return pickDistinctFromPool(
      count,
      [...ATHLETIC_COMPETITION_IDENTITY_MEN, ...ATHLETIC_COMPETITION_IDENTITY_WOMEN],
      options
    ).slice(0, 2);
  }

  const pool = options.athletic
    ? gender === 'women'
      ? ATHLETIC_COMPETITION_IDENTITY_WOMEN
      : gender === 'men'
        ? ATHLETIC_COMPETITION_IDENTITY_MEN
        : [...ATHLETIC_COMPETITION_IDENTITY_WOMEN, ...ATHLETIC_COMPETITION_IDENTITY_MEN]
    : gender === 'women'
      ? IDENTITY_WOMEN
      : gender === 'men'
        ? IDENTITY_MEN
        : [...IDENTITY_WOMEN, ...IDENTITY_MEN];

  return pickDistinctFromPool(count, pool, options);
}

function pickDistinctFromPool(
  count: number,
  pool: readonly string[],
  options: { allowMinimalHair?: boolean; athletic?: boolean }
): string[] {
  const filtered = filterIdentityPool(pool, options);
  const shuffled = shuffle(filtered.length > 0 ? filtered : [...pool]);
  const picked: string[] = [];

  for (const entry of shuffled) {
    if (picked.length >= count) {
      break;
    }
    if (!picked.includes(entry)) {
      picked.push(entry);
    }
  }

  return picked;
}

function filterIdentityPool(
  pool: readonly string[],
  options: { allowMinimalHair?: boolean; athletic?: boolean }
): string[] {
  return pool.filter(entry => {
    if (options.athletic && ATHLETIC_IDENTITY_EXCLUDE.test(entry)) {
      return false;
    }
    if (!options.allowMinimalHair && MINIMAL_HAIR_PATTERN.test(entry)) {
      return false;
    }
    return true;
  });
}

export function pickDistinctSubjects(count: number, gender: SubjectGender = 'any'): string[] {
  if (gender === 'mixed' && count >= 2) {
    return shuffle([pick(SUBJECTS_MEN), pick(SUBJECTS_WOMEN)]).slice(0, 2);
  }

  const pool =
    gender === 'women' ? SUBJECTS_WOMEN : gender === 'men' ? SUBJECTS_MEN : POOLS.subjects;

  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

function filterHairPreference(pool: readonly string[], allowMinimalHair: boolean): string[] {
  if (allowMinimalHair) {
    return [...pool];
  }

  return pool.filter(entry => !MINIMAL_HAIR_PATTERN.test(entry));
}

export function pickCharacterSubject(
  gender: SubjectGender = 'any',
  allowMinimalHair = false
): string {
  const pool =
    gender === 'women' ? SUBJECTS_WOMEN : gender === 'men' ? SUBJECTS_MEN : POOLS.subjects;

  const filtered = filterHairPreference(pool, allowMinimalHair);
  const fallback = filterHairPreference(POOLS.subjects, allowMinimalHair);
  const candidates = filtered.length > 0 ? filtered : fallback;

  return pick(candidates.length > 0 ? candidates : [...POOLS.subjects]);
}

function sessionNonce(): string {
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return `${array[0]!.toString(36)}-${array[1]!.toString(36)}`;
}

export function buildVariationSeed(
  strength = 65,
  options: {
    distinctPeople?: boolean;
    impliedPeopleCount?: number | null;
    gender?: SubjectGender;
  } = {}
): string {
  const parts: string[] = [];
  const wild = strength >= 75;
  const chaos = strength >= 90;
  const distinctPeople = options.distinctPeople ?? false;
  const peopleCount = options.impliedPeopleCount ?? null;
  const gender = options.gender ?? 'any';

  parts.push(`Light the scene with ${pick(POOLS.lighting)}.`);
  parts.push(`Color palette leaning toward ${pick(POOLS.palette)}.`);
  parts.push(`Compose it as ${pick(POOLS.framing)}.`);
  parts.push(`Atmosphere: ${pick(POOLS.atmosphere)}.`);

  if (!distinctPeople && peopleCount !== null && peopleCount >= 2) {
    if (gender === 'women') {
      parts.push(
        'Describe two women together as one unified subject—not split into separate catalog entries.'
      );
    } else if (gender === 'men') {
      parts.push(
        'Describe two men together as one unified subject—not split into separate catalog entries.'
      );
    } else {
      parts.push(
        'Describe the pair as one unified couple or ensemble—not separate Person A and Person B.'
      );
    }
  } else if (distinctPeople && peopleCount !== null && peopleCount >= 2) {
    const castGender = gender === 'mixed' ? 'mixed' : gender;
    const subjects = pickDistinctSubjects(Math.min(peopleCount, 4), castGender);
    parts.push(
      `Cast each person separately: ${subjects.map((subject, index) => `person ${index + 1} like ${subject}`).join('; ')}.`
    );
    if (gender === 'women') {
      parts.push('Both people must be women.');
    } else if (gender === 'men') {
      parts.push('Both people must be men.');
    }
    parts.push(
      'Describe every person with their own face, body, clothing, and pose—never one merged couple or blob.'
    );
  } else if (strength >= 35) {
    parts.push(
      `If people belong in the scene, imagine someone like ${pick(POOLS.subjects)}—specific, not generic.`
    );
  }

  if (wild) {
    if (!(distinctPeople && peopleCount !== null && peopleCount >= 2)) {
      parts.push(
        `Or someone utterly unlike prior outputs, such as ${pick(POOLS.subjects)}—choose one and commit fully.`
      );
    }
    parts.push(`Visual style: ${pick(POOLS.styles)}.`);
    parts.push(`Era or world texture: ${pick(POOLS.eras)}.`);
    parts.push(`Camera feel: ${pick(POOLS.lenses)}.`);
    parts.push(`Weave in an unexpected detail: ${pick(POOLS.twists)}.`);
    parts.push(`Reinterpret the topic as ${pick(POOLS.reinterpretations)}.`);
    parts.push(pick(POOLS.mandates));
  }

  if (distinctPeople && peopleCount === null) {
    parts.push(
      'If more than one person appears, split them into fully separate individuals with contrasting details.'
    );
  }

  if (chaos) {
    parts.push(pick(POOLS.mandates));
    parts.push(pick(POOLS.mandates));
    parts.push(
      'Radically invent—never reuse default faces, couples, alley cats, beach walkers, or prior sentence structures.'
    );
    parts.push(
      'Vary who is centered, what action is happening, and how the scene opens from any previous generation.'
    );
    parts.push(`One-off composition id ${sessionNonce()}—must read as a unique image.`);
  } else if (strength >= 50) {
    parts.push(
      'Invent a fresh scene—vary age, ethnicity, body type, hair, clothing, and expression from prior generations.'
    );
  }

  return parts.join(' ');
}

export function buildVariationSystemAddendum(strength: number): string {
  if (strength < 55) {
    return '';
  }

  const lines = [pick(POOLS.mandates)];

  if (strength >= 75) {
    lines.push(
      'Treat repeated keywords as an excuse to explore a new angle, not to repeat prior wording or cast.'
    );
    lines.push(pick(POOLS.reinterpretations));
  }

  if (strength >= 90) {
    lines.push(
      'Maximize novelty: different opening line, different hero subject, different emotional temperature than your default.'
    );
  }

  return lines.join(' ');
}

export function pickFewShotExamples<T>(examples: T[], strength = 65, enabled = true): T[] {
  if (!enabled) {
    return examples;
  }

  if (strength >= 90) {
    return [];
  }

  if (strength >= 75) {
    return shuffle(examples).slice(0, 1);
  }

  if (strength <= 25) {
    return examples;
  }

  if (strength <= 50) {
    return shuffle(examples).slice(0, Math.min(3, examples.length));
  }

  return shuffle(examples).slice(0, Math.min(2, examples.length));
}

export function buildTemplateVariation(
  strength = 65,
  distinctPeople = false,
  impliedPeopleCount: number | null = null,
  gender: SubjectGender = 'any'
): string {
  const parts: string[] = [
    capitalize(pick(POOLS.lighting)),
    `Palette favors ${pick(POOLS.palette)}.`,
    `Mood feels ${pick(POOLS.atmosphere)}.`,
  ];

  if (distinctPeople && impliedPeopleCount !== null && impliedPeopleCount >= 2) {
    const castGender = gender === 'mixed' ? 'mixed' : gender;
    const subjects = pickDistinctSubjects(Math.min(impliedPeopleCount, 2), castGender);
    parts.push(
      `One figure resembles ${subjects[0]}; the other is clearly different—like ${subjects[1] ?? pick(POOLS.subjects)}—each described separately.`
    );
  } else if (!distinctPeople && impliedPeopleCount !== null && impliedPeopleCount >= 2) {
    parts.push('The pair reads as one unified subject in the frame.');
  } else if (strength >= 45) {
    parts.push(
      `Figures, if any, resemble ${pick(POOLS.subjects)} with concrete, distinct features.`
    );
  }

  if (strength >= 75) {
    parts.push(`Style leans ${pick(POOLS.styles)}.`);
    parts.push(`Include ${pick(POOLS.twists)}.`);
    parts.push(pick(POOLS.reinterpretations));
  }

  if (strength >= 90) {
    parts.push(`Also consider ${pick(POOLS.subjects)} instead of a generic default.`);
    parts.push(pick(POOLS.mandates));
  }

  return parts.join(' ');
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getSamplingBoost(strength: number): {
  temperatureBoost: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
} {
  const t = strength / 100;

  return {
    temperatureBoost: t * 0.55,
    topP: 0.88 + t * 0.11,
    frequencyPenalty: t * 0.65,
    presencePenalty: t * 0.75,
  };
}
