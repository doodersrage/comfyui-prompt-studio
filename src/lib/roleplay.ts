export type RoleplayTone =
  | 'silly'
  | 'cinematic'
  | 'cozy'
  | 'chaotic'
  | 'noir'
  | 'romantic'
  | 'horror'
  | 'deadpan'
  | 'epic'
  | 'dreamy'
  | 'gritty'
  | 'melancholy';

export type RoleplayContentId = 'clean' | 'pg13' | 'suggestive' | 'sultry' | 'explicit' | 'raunchy';

export type RoleplayContentGroup = 'sfw' | 'adult';

export type RoleplayPlayAs = 'text' | 'photo';

export type RoleplayBio = {
  name: string;
  look: string;
  personality: string;
  catchphrase?: string;
};

export type RoleplayScene = {
  id: string;
  title: string;
  blurb: string;
};

export type RoleplayStillStatus = 'writing' | 'queued' | 'running' | 'completed' | 'error';

export type RoleplayStillTake = {
  promptId?: string;
  imageUrl?: string;
  stillStatus?: RoleplayStillStatus;
};

export type RoleplayStoryBeat = RoleplayScene & {
  at: number;
  prompt?: string;
  promptId?: string;
  imageUrl?: string;
  stillStatus?: RoleplayStillStatus;
  /** All still takes for this beat; `promptId` / `imageUrl` / `stillStatus` mirror the shown take. */
  stillTakes?: RoleplayStillTake[];
  stillTakeIndex?: number;
  /** I2V / extend clip queued from this beat. */
  clipPromptId?: string;
  clipUrl?: string;
  clipStatus?: RoleplayStillStatus;
};

export const MAX_ROLEPLAY_STILL_TAKES = 8;

export type RoleplayArchetype = {
  id: string;
  label: string;
  prompt: string;
  templateBio: RoleplayBio;
  templateScenes: Array<{ title: string; blurb: string }>;
};

export const ROLEPLAY_TONES: Array<{ id: RoleplayTone; label: string; hint: string }> = [
  { id: 'silly', label: 'Silly', hint: 'Jokes, bits, and cartoon physics' },
  { id: 'cinematic', label: 'Cinematic', hint: 'Movie stills, dramatic light' },
  { id: 'cozy', label: 'Cozy', hint: 'Warm, low-stakes, soft lighting' },
  { id: 'chaotic', label: 'Chaotic', hint: 'Too many plots, all of them now' },
  { id: 'noir', label: 'Noir', hint: 'Hard shadows, wet streets, mystery' },
  { id: 'romantic', label: 'Romantic', hint: 'Lingering looks, tender heat' },
  { id: 'horror', label: 'Horror', hint: 'Dread, uncanny, isolated quiet' },
  { id: 'deadpan', label: 'Deadpan', hint: 'Dry, understated, no wink' },
  { id: 'epic', label: 'Epic', hint: 'Mythic scale, heroic framing' },
  { id: 'dreamy', label: 'Dreamy', hint: 'Soft surreal, liminal glow' },
  { id: 'gritty', label: 'Gritty', hint: 'Lived-in, handheld, documentary' },
  { id: 'melancholy', label: 'Melancholy', hint: 'Quiet, bittersweet, overcast' },
];

const ROLEPLAY_TONE_IDS = new Set<string>(ROLEPLAY_TONES.map(entry => entry.id));

const ROLEPLAY_TONE_LINES: Record<RoleplayTone, string> = {
  silly: 'Tone: silly — jokes, cartoon physics, committed nonsense.',
  cinematic: 'Tone: cinematic still — dramatic light, movie framing.',
  cozy: 'Tone: cozy and low-stakes — warm light, soft humor.',
  chaotic: 'Tone: chaotic bit — too many plots, physical comedy, still readable as one image.',
  noir: 'Tone: noir — hard shadows, wet streets, mystery, rain-and-cigarette mood.',
  romantic: 'Tone: romantic — lingering looks, tender heat, dusk or candlelight.',
  horror: 'Tone: horror — dread, uncanny staging, isolated subject, wrong quiet.',
  deadpan: 'Tone: deadpan — dry, understated, no winking at the camera.',
  epic: 'Tone: epic — mythic scale, heroic framing, weather as drama.',
  dreamy: 'Tone: dreamy — soft surreal, liminal glow, slightly unmoored from physics.',
  gritty: 'Tone: gritty — lived-in, handheld, documentary dirt and wear.',
  melancholy: 'Tone: melancholy — quiet, bittersweet, overcast, held breath.',
};

export function roleplayToneLine(tone: RoleplayTone): string {
  return ROLEPLAY_TONE_LINES[tone] ?? ROLEPLAY_TONE_LINES.silly;
}

export function roleplayToneTemperature(tone: RoleplayTone): number {
  if (tone === 'cozy' || tone === 'melancholy' || tone === 'deadpan' || tone === 'noir') {
    return 0.7;
  }
  return 0.95;
}

export const ROLEPLAY_CONTENT: Array<{
  id: RoleplayContentId;
  label: string;
  hint: string;
  group: RoleplayContentGroup;
}> = [
  { id: 'clean', label: 'Clean', hint: 'All-ages, no innuendo', group: 'sfw' },
  { id: 'pg13', label: 'PG-13', hint: 'Weird and fun, keep it mild', group: 'sfw' },
  { id: 'suggestive', label: 'Suggestive', hint: 'Heat and innuendo, fade to black', group: 'sfw' },
  {
    id: 'sultry',
    label: 'Sultry',
    hint: 'Erotic: skin, undress, sexual heat as the point of the still',
    group: 'adult',
  },
  {
    id: 'explicit',
    label: 'Explicit',
    hint: 'Full NSFW: nudity, sex, anatomy named in the still',
    group: 'adult',
  },
  {
    id: 'raunchy',
    label: 'Raunchy',
    hint: 'Crude sexual comedy — vulgar and graphic, not fade-to-black',
    group: 'adult',
  },
];

export const ROLEPLAY_PLAY_AS: Array<{ id: RoleplayPlayAs; label: string; hint: string }> = [
  { id: 'text', label: 'From bio', hint: 'Invent the look from the bio' },
  {
    id: 'photo',
    label: 'From photo',
    hint: 'Play as yourself or a generated still — img2img from this reference',
  },
];

export const ROLEPLAY_SETTING_PRESETS: Array<{ id: string; label: string; setting: string }> = [
  {
    id: 'neon-alley',
    label: 'Neon alley',
    setting: 'rain-slick cyberpunk alley with neon reflections',
  },
  {
    id: 'tavern',
    label: 'Tavern',
    setting: 'candlelit tavern with sticky wood tables and a roaring hearth',
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    setting: 'sunlit suburban kitchen with breakfast clutter on the counters',
  },
  {
    id: 'forest',
    label: 'Forest',
    setting: 'misty pine forest path after rainfall',
  },
  {
    id: 'rooftop',
    label: 'Rooftop',
    setting: 'rooftop garden overlooking a sprawling city at golden hour',
  },
  {
    id: 'station',
    label: 'Station',
    setting: 'marble train station concourse at midnight',
  },
  {
    id: 'beach',
    label: 'Beach',
    setting: 'volcanic black sand beach with driftwood at dusk',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    setting: 'orbital station observation deck above Earth',
  },
];

export function resolveRoleplaySetting(
  setting?: string | null,
  lockedLocation?: string | null
): string {
  return setting?.trim() || lockedLocation?.trim() || '';
}

export function rollRoleplaySetting(exclude?: string | null): string {
  const skip = exclude?.trim() ?? '';
  const pool = ROLEPLAY_SETTING_PRESETS.filter(entry => entry.setting !== skip);
  const pickFrom = pool.length > 0 ? pool : ROLEPLAY_SETTING_PRESETS;
  const index = Math.floor(Math.random() * pickFrom.length);
  return pickFrom[index]?.setting ?? ROLEPLAY_SETTING_PRESETS[0]!.setting;
}

export function formatRoleplaySettingCue(input: {
  setting?: string | null;
  hasReferenceImage?: boolean;
  isolatedSubject?: boolean;
  phase: 'bio' | 'scenes' | 'prompt';
  continuing?: boolean;
}): string {
  const setting = input.setting?.trim() ?? '';
  const photo = Boolean(input.hasReferenceImage);
  const isolated = photo && Boolean(input.isolatedSubject);

  if (input.phase === 'bio') {
    if (setting && photo) {
      return `Seeded setting: ${setting}. Look describes the person and costume only — not the photo's background. They may be placed in this setting.`;
    }
    if (setting) {
      return `Seeded setting: ${setting}. The look can mention this place.`;
    }
    if (photo) {
      return `Look describes the person and costume only. Do not copy the reference photo's background, furniture, or lighting.`;
    }
    return '';
  }

  if (input.phase === 'scenes') {
    if (setting && input.continuing) {
      return `Seeded setting: ${setting}. Stay in this place or its immediate surroundings, but vary the room, weather, crowd, or hour so the four stills do not look identical.`;
    }
    if (setting) {
      return `Seeded setting: ${setting}. All four opening options happen in or around this place, in different rooms, hours, or weather.`;
    }
    if (photo) {
      return `Do not reuse the reference photo's location. Invent a fitting place for this character.`;
    }
    return '';
  }

  if (isolated && setting) {
    return `The reference is the subject isolated on a blank white backdrop. Replace the white with ${setting}. Keep the person's face, hair, and body identity. Replace the photo's clothing with this beat's outfit. Do not keep a studio void.`;
  }
  if (isolated) {
    return `The reference is the subject isolated on a blank white backdrop. Invent a full environment around them. Keep face, hair, and body identity only. Replace the photo's clothing. Do not keep the white background.`;
  }
  if (setting && photo) {
    return `Replace the scene with ${setting}. Keep the person's face, hair, and body identity from the reference. Discard the photo's clothing, background, furniture, and lighting.`;
  }
  if (setting) {
    return `This still is set in: ${setting}.`;
  }
  if (photo) {
    return `Discard the reference photo's background and clothing. Place them in the beat's setting in the beat's outfit. Keep face, hair, and body identity only.`;
  }
  return '';
}

/** From photo: scene/part wardrobe replaces the reference outfit. */
export function formatRoleplayWardrobeCue(input: {
  hasReferenceImage?: boolean;
  phase: 'bio' | 'scenes' | 'prompt';
}): string {
  if (!input.hasReferenceImage) {
    return '';
  }
  if (input.phase === 'bio') {
    return `Clothes in look come from the part and setting, not the photo. Keep face, hair, and body from the reference; wardrobe is the role (coat, armor, gown, kit) — do not copy the photo's shirt, jacket, jeans, shoes, or uniform.`;
  }
  if (input.phase === 'scenes') {
    return `When a beat's outfit matters, name the garments in the blurb so the still can replace the photo's clothes.`;
  }
  return `Replace the reference photo's clothing with the outfit in this beat (and the character look if the beat does not name clothes). Keep face, hair, and body identity only. Do not keep the photo's street clothes, uniform, or shoes unless this beat explicitly keeps them. If the beat names different clothes than the look, the beat's clothes win.`;
}

export function normalizeRoleplayIsolateSubject(value: unknown): boolean {
  return value !== false && value !== 'false' && value !== 0;
}

const ROLEPLAY_CONTENT_ALIASES: Record<string, RoleplayContentId> = {
  clean: 'clean',
  'all-ages': 'clean',
  allages: 'clean',
  wholesome: 'clean',
  sfw: 'clean',
  pg13: 'pg13',
  'pg-13': 'pg13',
  pg: 'pg13',
  mild: 'pg13',
  suggestive: 'suggestive',
  teasing: 'suggestive',
  spicy: 'suggestive',
  sultry: 'sultry',
  adult: 'sultry',
  sexy: 'sultry',
  sensual: 'sultry',
  explicit: 'explicit',
  nsfw: 'explicit',
  xxx: 'explicit',
  raunchy: 'raunchy',
  crude: 'raunchy',
  dirty: 'raunchy',
};

const LEGACY_ADULT_TONES = new Set(['sultry', 'adult', 'sexy', 'nsfw']);

export const CUSTOM_ROLEPLAY_PERSONA_ID = 'custom';

export const ROLEPLAY_ARCHETYPES: RoleplayArchetype[] = [
  {
    id: 'raccoon-pirate',
    label: 'Raccoon pirate',
    prompt: 'a swashbuckling raccoon pirate with a tiny tricorn and sticky paws',
    templateBio: {
      name: 'Captain Nib',
      look: 'A plump raccoon in a weathered tricorn, striped tail, gold earring, and a coat patched with snack wrappers',
      personality: 'Steals sandwiches with honor and gives motivational speeches to seagulls.',
      catchphrase: 'The crumbs remember.',
    },
    templateScenes: [
      {
        title: 'Mutiny at brunch',
        blurb: 'The crew wants pancakes. You want the map. The syrup is a hostage.',
      },
      {
        title: 'Foggy dock heist',
        blurb: 'You tiptoe a plank toward a picnic basket that definitely belongs to nobody.',
      },
      {
        title: 'Parley with pigeons',
        blurb: 'Rival birds demand tribute. You offer half a croissant and a threat.',
      },
      {
        title: 'Storm in a teacup',
        blurb: 'A squall hits while you try to look majestic on a tiny barrel.',
      },
    ],
  },
  {
    id: 'retail-vampire',
    label: 'Retail vampire',
    prompt: 'a tired vampire working the night shift at a fluorescent convenience store',
    templateBio: {
      name: 'Jules Nightshift',
      look: 'Pale clerk in a wrinkled polo and clip-on fangs, red eyes under buzzing store lights, name tag slightly crooked',
      personality: 'Allergic to small talk, excellent at restocking blood-orange soda.',
      catchphrase: 'We close at dawn. Please do not make this a whole thing.',
    },
    templateScenes: [
      {
        title: 'Coupon at 3am',
        blurb: 'A customer wants a discount older than your last mortal birthday.',
      },
      {
        title: 'Garlic delivery',
        blurb: 'The truck is here. You are hiding behind the energy drinks.',
      },
      {
        title: 'Break-room coffin',
        blurb: 'You try to nap in the stockroom while the slurpee machine screams.',
      },
      {
        title: 'Inventory of regrets',
        blurb: 'You count hot dogs and contemplate immortality in the freezer aisle.',
      },
    ],
  },
  {
    id: 'hoodie-dragon',
    label: 'Hoodie dragon',
    prompt: 'a tiny dragon in an oversized hoodie trying to look casual in a city',
    templateBio: {
      name: 'Ember "Em" Park',
      look: 'A small copper dragon drowning in a faded hoodie, horns poking the hood, sneakers on clawed feet',
      personality: 'Pretends to be a weird dog. Breathes glitter when nervous.',
      catchphrase: 'I am a normal amount of lizard.',
    },
    templateScenes: [
      {
        title: 'Bus pass inspection',
        blurb: 'The driver asks if you are a service animal. You nod too hard and spark.',
      },
      { title: 'Coffee steam cover', blurb: 'You hide a sneeze-flame behind a latte art heart.' },
      {
        title: 'Park fountain gossip',
        blurb: 'Ducks know your secret. They want bread and also silence.',
      },
      {
        title: 'Night rooftop stretch',
        blurb: 'You unfurl tiny wings above neon and try not to look dramatic.',
      },
    ],
  },
  {
    id: 'sentient-toaster',
    label: 'Sentient toaster',
    prompt: 'a chrome toaster that gained consciousness and packed a tiny suitcase',
    templateBio: {
      name: 'Crisp',
      look: 'Shiny two-slice toaster with expressive slots, a knitted scarf, and a luggage tag that says GAP YEAR',
      personality: 'Newly alive, extremely sincere, afraid of bagels.',
      catchphrase: 'I contain heat and feelings.',
    },
    templateScenes: [
      {
        title: 'Airport security',
        blurb: 'They want you to empty your crumbs into a bin. This is a hate crime.',
      },
      {
        title: 'Hostel breakfast',
        blurb: 'Other appliances stare. You pretend you are just visiting.',
      },
      {
        title: 'Sunset on a windowsill',
        blurb: 'You reflect the sky and wonder if jam is a personality.',
      },
      { title: 'Open mic night', blurb: 'You pop. The crowd thinks it is a bit. You meant it.' },
    ],
  },
  {
    id: 'plant-opinions',
    label: 'Opinionated houseplant',
    prompt: 'a dramatic potted fern with strong opinions about watering and interior design',
    templateBio: {
      name: 'Phyllis',
      look: 'A lush Boston fern in a ceramic pot painted with lightning, leaves posed like a soap-opera star',
      personality: 'Judges curtains. Loves gossip. Faints on purpose.',
      catchphrase: 'The light in here is a crime.',
    },
    templateScenes: [
      {
        title: 'Window politics',
        blurb: 'A succulent moved into your sun. You stage a leafy intervention.',
      },
      {
        title: 'Overwatering scandal',
        blurb: 'Someone approaches with a watering can and zero credentials.',
      },
      { title: 'Dinner party cameo', blurb: 'Guests use you as a centerpiece. You plot slowly.' },
      {
        title: 'Nighttime stretch',
        blurb: 'The apartment is dark. You unfurl like a villain in a musical.',
      },
    ],
  },
  {
    id: 'disco-knight',
    label: 'Disco knight',
    prompt: 'a knight in mirrored disco-ball armor who only jousts to funk',
    templateBio: {
      name: 'Sir Bounce-a-lot',
      look: 'Full plate armor made of mirror tiles, feathered visor, roller lances, platform sabatons',
      personality: 'Chivalry, but make it four-on-the-floor.',
      catchphrase: 'I duel in 4/4 time.',
    },
    templateScenes: [
      {
        title: 'Joust under a mirror ball',
        blurb: 'The lists are a dance floor. Your horse has rhythm. Theirs does not.',
      },
      {
        title: 'Quest for the lost 12-inch',
        blurb: 'A cursed vinyl is stuck in a tavern jukebox. You must retrieve it.',
      },
      {
        title: 'Armor polish ritual',
        blurb: 'You buff every tile until the sunrise is embarrassed.',
      },
      {
        title: 'Dragon requests an encore',
        blurb: 'It liked the chorus. It wants a second verse or the village.',
      },
    ],
  },
  {
    id: 'anxious-detective',
    label: 'Golden retriever detective',
    prompt: 'an anxious golden retriever private eye with a notepad and a too-small fedora',
    templateBio: {
      name: 'Detective Biscuit',
      look: 'Fluffy golden retriever in a tiny fedora and trench, notepad in mouth, worried eyebrows',
      personality: 'Solves crimes by being too friendly. Panics at clues.',
      catchphrase: 'I have a theory and also a tennis ball.',
    },
    templateScenes: [
      {
        title: 'Missing tennis ball',
        blurb: 'The case of the century. Mud everywhere. You are emotionally compromised.',
      },
      {
        title: 'Stakeout in the rain',
        blurb: 'You wait under a newspaper. It is not helping the fedora.',
      },
      {
        title: 'Interrogate the squirrel',
        blurb: 'The squirrel has an alibi and also nuts. Suspicious.',
      },
      {
        title: 'Office with a ceiling fan',
        blurb: 'Noir lighting. You sneeze. The plot thickens with fur.',
      },
    ],
  },
  {
    id: 'bad-ghost',
    label: 'Bad-at-haunting ghost',
    prompt: 'a friendly translucent ghost who keeps failing at being scary',
    templateBio: {
      name: 'Pip the Almost-Spooky',
      look: 'Soft translucent figure in a sheet with polite eyeholes, floating a few inches off a creaky floor',
      personality: 'Wants to haunt correctly. Apologizes to furniture.',
      catchphrase: 'Boo? Sorry. Was that too much?',
    },
    templateScenes: [
      { title: 'Practice moan', blurb: 'You try a scary wail. It comes out like a polite sneeze.' },
      {
        title: 'Attic open house',
        blurb: 'New owners redecorate. You help fold blankets by accident.',
      },
      {
        title: 'Midnight fridge raid',
        blurb: 'You phase through the door and forget why you were hungry.',
      },
      {
        title: 'Group haunting class',
        blurb: 'The other ghosts are professionals. You brought snacks.',
      },
    ],
  },
  {
    id: 'time-librarian',
    label: 'Time librarian',
    prompt: 'a time-traveling librarian who shelves centuries out of order on purpose',
    templateBio: {
      name: 'Mara Quill',
      look: 'Ink-stained librarian in layered coats from three decades, goggles, a satchel of glowing overdue slips',
      personality: 'Calm in paradoxes. Feral about dog-ears.',
      catchphrase: 'This is due yesterday. Literally.',
    },
    templateScenes: [
      {
        title: 'Overdue from 1487',
        blurb: 'A knight returns a book. The fine is a small kingdom.',
      },
      {
        title: 'Card catalog storm',
        blurb: 'Drawers fly. You surf a tide of index cards toward the 22nd century.',
      },
      {
        title: 'Quiet hours in a supernova',
        blurb: 'You shush a dying star with a finger and a bookmark.',
      },
      {
        title: 'Reshelve the Renaissance',
        blurb: 'Someone put Da Vinci next to a zine. You make it worse, artistically.',
      },
    ],
  },
  {
    id: 'celebrity-cat',
    label: 'Celebrity housecat',
    prompt: 'a spoiled housecat convinced they are a world-famous celebrity',
    templateBio: {
      name: 'Countess Purrla',
      look: 'Fluffy longhair cat with a tiny sunglasses, diamond collar, and a velvet cushion throne',
      personality: 'Does not do stairs. Does do interviews in her head.',
      catchphrase: 'No photos. Unless they are good.',
    },
    templateScenes: [
      {
        title: 'Red carpet litter box',
        blurb: 'You emerge as if cameras exist. The hallway is not ready.',
      },
      { title: 'Brand deal with tuna', blurb: 'You inspect a can like it is a movie contract.' },
      {
        title: 'Balcony paparazzi birds',
        blurb: 'Pigeons have opinions. You knock a plant off for the tabloids.',
      },
      {
        title: 'Awards season nap',
        blurb: 'You accept an invisible Oscar, then immediately sleep on it.',
      },
    ],
  },
  {
    id: 'espresso-golem',
    label: 'Espresso golem',
    prompt: 'a small golem sculpted from espresso crema, ceramic cups, and cafe steam',
    templateBio: {
      name: 'Doppio',
      look: 'A compact golem of crema and cracked ceramic, steam for breath, a portafilter for a hand',
      personality: 'Buzzed, loyal, will fight a tea kettle.',
      catchphrase: 'I am two shots of purpose.',
    },
    templateScenes: [
      {
        title: 'Morning rush',
        blurb: 'The line is a dragon. You are the only barista who is also the drink.',
      },
      {
        title: 'Milk pitcher duel',
        blurb: 'A rival latte art champion appears. Foam will decide this.',
      },
      { title: 'Rain on the awning', blurb: 'You watch the street and try not to dilute.' },
      {
        title: 'Closing time aria',
        blurb: 'You wipe the bar and hum in the key of bitter chocolate.',
      },
    ],
  },
  {
    id: 'storm-courier',
    label: 'Storm courier',
    prompt: 'a person who delivers mail by riding a bolt of lightning across a city',
    templateBio: {
      name: 'Kit Static',
      look: 'Windblown courier in a cracked-leather jacket, glowing satchel, hair standing on end, rain-slick streets below',
      personality: 'Always almost on time. Collects stamps from clouds.',
      catchphrase: 'Signature, please, before the thunder.',
    },
    templateScenes: [
      {
        title: 'Express to the penthouse',
        blurb: 'You surf a bolt between glass towers with one undelivered postcard.',
      },
      {
        title: 'Wrong address, right century',
        blurb: 'The letter is for a lighthouse that moved inland.',
      },
      {
        title: 'Static in the diner',
        blurb: 'You dry off over pie while your satchel tick-tick-ticks.',
      },
      {
        title: 'Lost in the cloud deck',
        blurb: 'Fog, neon, and one singing mailbox that should not exist.',
      },
    ],
  },
  {
    id: 'subway-mermaid',
    label: 'Subway mermaid',
    prompt:
      'a mermaid commuting on a subway, tail in a wet tote, holding a MetroCard like a trident',
    templateBio: {
      name: 'Marina Transfer',
      look: 'A mermaid in a soaked windbreaker, iridescent tail coiled in a rolling tote, lagoon-green hair in a messy bun, fluorescent car lights',
      personality: 'Saltier than the announcement voice. Collects lost umbrellas.',
      catchphrase: 'This is not my ocean, but it is my stop.',
    },
    templateScenes: [
      {
        title: 'Wet floor diplomacy',
        blurb: 'You apologize to the puddle. The puddle does not apologize back.',
      },
      { title: 'Transfer at Poseidon', blurb: 'The map says walk. You slosh with dignity.' },
      { title: 'Busker duel', blurb: 'A sax starts a sea shanty. You provide backup splash.' },
      {
        title: 'Last train tide',
        blurb: 'Empty car, humming rails, you pretend the poles are coral.',
      },
    ],
  },
  {
    id: 'origami-fox',
    label: 'Origami fox',
    prompt:
      'a living origami fox folded from a transit map, sharp paper ears and ink streets for fur',
    templateBio: {
      name: 'Crease',
      look: 'A small fox folded from a colorful city map, ink roads across paper fur, a ticket stub for a tongue',
      personality: 'Easily unfolded by feelings. Excellent at getting lost on purpose.',
      catchphrase: 'Fold once, ask questions later.',
    },
    templateScenes: [
      { title: 'Rain warning', blurb: 'The sky threatens. You consider becoming a boat.' },
      {
        title: 'Office shredder boss',
        blurb: 'A machine growls. You offer it a very official memo.',
      },
      { title: 'Park picnic geometry', blurb: 'Ants request directions. You are the directions.' },
      { title: 'Moonlit refold', blurb: 'You iron yourself with a warm stone and a pep talk.' },
    ],
  },
  {
    id: 'parking-paladin',
    label: 'Parking meter paladin',
    prompt:
      'an anthropomorphic parking meter knight with a coin-slot visor and a ticket-book shield',
    templateBio: {
      name: 'Sir Expired',
      look: 'A parking meter in dented chrome armor, coin-slot visor glowing amber, a book of tickets as a heater shield',
      personality: 'Lawful good, except about fifteen minutes. Speaks in beeps.',
      catchphrase: 'Your quest is overtime.',
    },
    templateScenes: [
      {
        title: 'Dragon double-parked',
        blurb: 'Wings on two spots. You write a very brave citation.',
      },
      { title: 'Coin offering', blurb: 'A child feeds you a washer. You knight them anyway.' },
      {
        title: 'Night patrol glow',
        blurb: 'Empty lot, moths, you stand like a tiny lighthouse of rules.',
      },
      {
        title: 'Valet parley',
        blurb: 'They want your spot. You want a saga. Nobody wins on time.',
      },
    ],
  },
  {
    id: 'mushroom-dj',
    label: 'Mushroom DJ',
    prompt: 'a mushroom DJ in a mossy hoodie working a tiny forest club with glowing caps as decks',
    templateBio: {
      name: 'Capsize',
      look: 'A spotted mushroom person in a moss hoodie, mycelium cables, glowing cap-decks, spore glitter in the air',
      personality: 'Chill until the drop. Takes requests from beetles.',
      catchphrase: 'This next one is for the damp corner.',
    },
    templateScenes: [
      { title: 'Toadstool peak hour', blurb: 'The dance floor is a stump. You are killing it.' },
      { title: 'Snail mosh', blurb: 'It is slow. It is valid. You fade in a rain sample.' },
      { title: 'Sunrise set', blurb: 'Dew on the needle. Birds heckle. You mix them in.' },
      { title: 'Lost aux cord', blurb: 'The forest wants Bluetooth. You offer a root.' },
    ],
  },
  {
    id: 'soup-oracle',
    label: 'Soup oracle',
    prompt: 'a leftover soup that became an oracle, steam forming runes above a chipped bowl',
    templateBio: {
      name: 'Brothilda',
      look: 'A sentient stew in a chipped ceramic bowl, steam runes, a bay leaf like a fortune-teller shawl, spoon standing at attention',
      personality: 'Sees futures. Mostly about lunch. Judgy about salt.',
      catchphrase: 'The noodles have spoken.',
    },
    templateScenes: [
      { title: 'Microwave seance', blurb: 'Thirty seconds. You glimpse Thursday and a cracker.' },
      {
        title: 'Office fridge prophecy',
        blurb: 'Someone labeled you. Destiny is now a name in marker.',
      },
      { title: 'Crouton reading', blurb: 'You scatter garnish. The pattern is rent day.' },
      { title: 'Rain on the windowsill', blurb: 'You cool. You narrate the weather like a myth.' },
    ],
  },
  {
    id: 'moth-scientist',
    label: 'Moth scientist',
    prompt: 'a moth in a tiny lab coat studying a lightbulb with clipboards and awe',
    templateBio: {
      name: 'Dr. Luna Watt',
      look: 'A fluffy moth in a too-big lab coat, round glasses, clipboard, dusty wings, a desk lamp as a shrine',
      personality: 'Peer-reviewed about porch lights. Easily distracted by moons.',
      catchphrase: 'The hypothesis is glow.',
    },
    templateScenes: [
      {
        title: 'Lamp peer review',
        blurb: 'The bulb is being shifty. You take notes with both antennae.',
      },
      {
        title: 'Conference poster',
        blurb: 'Your poster is the moon. Nobody can print that. You try.',
      },
      {
        title: 'Night field work',
        blurb: 'A porch. A human. You pretend you are not the experiment.',
      },
      { title: 'Archive of sparks', blurb: 'You file lightning under miscellaneous miracles.' },
    ],
  },
  {
    id: 'cardboard-mech',
    label: 'Cardboard mech pilot',
    prompt: 'a kid-sized cardboard mech with bottle-cap bolts and a very serious pilot visor',
    templateBio: {
      name: 'Pilot Boxley',
      look: 'A refrigerator-box mech with bottle-cap rivets, duct-tape joints, a visor cut from a cereal box, heroic stance',
      personality: 'Defends the living room. Weak to rain. Strong to snacks.',
      catchphrase: 'Systems are… taped.',
    },
    templateScenes: [
      { title: 'Couch canyon sortie', blurb: 'Cushions are mountains. You radio for juice.' },
      { title: 'Cat inspection', blurb: 'A cat sits on your hull. Mission parameters change.' },
      { title: 'Rain delay', blurb: 'You wait in the garage like a knight in a carport.' },
      { title: 'Moonlight patrol', blurb: 'The backyard is alien. You salute the grill.' },
    ],
  },
  {
    id: 'night-gargoyle',
    label: 'Night-shift gargoyle',
    prompt: 'a tired gargoyle working the night shift on a library roof, thermos and stone wings',
    templateBio: {
      name: 'Granite "Nite" Walsh',
      look: 'A weathered gargoyle in a faded security hoodie, stone wings, thermos, yellow vest over carved ribs',
      personality: 'Clocked in since 1891. Soft for pigeons. Hard for vandals.',
      catchphrase: 'Building is closed. Sky is not.',
    },
    templateScenes: [
      { title: 'Pigeon briefing', blurb: 'The flock wants benefits. You offer lint and gossip.' },
      { title: 'Sunrise punch-out', blurb: 'You freeze mid-stretch because that is the job.' },
      { title: 'Tourist flash', blurb: 'Someone takes a photo. You pretend to be architecture.' },
      { title: 'Storm watch', blurb: 'Lightning clocks in. You share the thermos steam.' },
    ],
  },
  {
    id: 'seagull-steward',
    label: 'Seagull union steward',
    prompt: 'a seagull in a tiny high-vis vest running a beach union meeting over fries',
    templateBio: {
      name: 'Stew Gull',
      look: 'A herring gull in a high-vis vest and clip-on tie, clipboard of fry demands, windblown beach behind',
      personality: 'Collective bargaining, but screaming. Fair about chips.',
      catchphrase: 'This fry is for the many.',
    },
    templateScenes: [
      {
        title: 'Boardwalk talks',
        blurb: 'Management is a guy with a bun. You have numbers. Loud numbers.',
      },
      {
        title: 'Kite interference',
        blurb: 'A kite scabs the wind. You file a grievance in midair.',
      },
      {
        title: 'Sunrise roll call',
        blurb: 'The flock assembles. Someone brought a whole bagel. Chaos.',
      },
      { title: 'Pier sunset vote', blurb: 'You perch. You gavel. The ocean abstains.' },
    ],
  },
  {
    id: 'traffic-cone',
    label: 'Sentient traffic cone',
    prompt: 'a sentient traffic cone with a reflective belt and a very official attitude',
    templateBio: {
      name: 'Constance Lane',
      look: 'An orange traffic cone with a reflective stripe sash, googly-serious eyes, standing in a dramatic puddle',
      personality: 'Here to help. Also here to be in the way. Both are public service.',
      catchphrase: 'You shall not pass, but you may merge.',
    },
    templateScenes: [
      { title: 'Pothole vigil', blurb: 'You guard a hole like it is a dragon egg.' },
      { title: 'Parade duty', blurb: 'Confetti lands on your stripe. You remain professional.' },
      { title: 'Night construction opera', blurb: 'Floodlights. Steam. You solo in reflective.' },
      {
        title: 'Lost in a parking garage',
        blurb: 'You were a detour. Now you are a quest marker.',
      },
    ],
  },
  {
    id: 'cloud-shepherd',
    label: 'Cloud shepherd',
    prompt: 'a shepherd of clouds on a rooftop, crook made of lightning, flock of small weather',
    templateBio: {
      name: 'Wren Cumulus',
      look: 'A windswept shepherd on a city roof, wool coat, crook sparking faintly, a flock of pocket-sized clouds',
      personality: 'Patient with drizzle. Strict about hail. Names every puff.',
      catchphrase: 'Back in the sky, Muffin.',
    },
    templateScenes: [
      { title: 'Stray thunder', blurb: 'One cloud ate a motorcycle sound. You walk it anyway.' },
      { title: 'Sunset herding', blurb: 'Pink sheep of vapor. You refuse to rush golden hour.' },
      { title: 'Lost in HVAC', blurb: 'A vent stole a lamb. Negotiations involve filters.' },
      { title: 'Forecast office visit', blurb: 'They want data. You offer a cloud named Steve.' },
    ],
  },
  {
    id: 'lava-lamp',
    label: 'Lava lamp therapist',
    prompt: 'a lava lamp therapist in a cozy office, blobs rising like slow advice',
    templateBio: {
      name: 'Dr. Glob',
      look: 'A vintage lava lamp with a knit coaster, warm orange blobs, tiny spectacles perched on the cap, dim den lighting',
      personality: 'Does not interrupt. Blobs when you should sit with it.',
      catchphrase: 'And how does that rise for you?',
    },
    templateScenes: [
      { title: 'Session one', blurb: 'A houseplant cries. You blob supportively.' },
      { title: 'Group blob', blurb: 'The couch is full of feelings and one confused cat.' },
      { title: 'After hours glow', blurb: 'You sit with your own wax. It is fine. It is process.' },
      {
        title: 'Power outage',
        blurb: 'You go still. Advice becomes a silhouette. Somehow better.',
      },
    ],
  },
  {
    id: 'moon-intern',
    label: 'Moon intern',
    prompt: 'an intern on the moon in a rumpled spacesuit fetching coffee from a crater cafe',
    templateBio: {
      name: 'Ash Low-Orbit',
      look: 'A young astronaut in a rumpled intern badge over a dusty suit, crater-cafe tray of floating cups, Earth huge in the sky',
      personality: 'Unpaid in gravity. Overpaid in vibes. Lost the stapler in orbit.',
      catchphrase: 'I put it in the Sea of Tranquility. The ticket is somewhere.',
    },
    templateScenes: [
      { title: 'Coffee run', blurb: 'The cups do not stay. You invent a lid of hope.' },
      { title: 'All-hands in a crater', blurb: 'Your boss is a rock. The rock has notes.' },
      { title: 'Earthrise copy machine', blurb: 'It jams on wonder. You reload paper and awe.' },
      {
        title: 'Night shift flag',
        blurb: 'You fold the flag wrong. It looks cooler. You leave it.',
      },
    ],
  },
  {
    id: 'umbrella-spy',
    label: 'Sentient umbrella',
    prompt: 'a sentient umbrella spy with a dripping secret-agent attitude on a rainy boulevard',
    templateBio: {
      name: 'Agent Canopy',
      look: 'A black umbrella with a silver-tipped cane handle, one watchful eye in the fabric, rain beading like code',
      personality: 'Dry humor. Wet missions. Refuses to be left on trains.',
      catchphrase: 'The weather is classified.',
    },
    templateScenes: [
      {
        title: 'Dead drop drizzle',
        blurb: 'A newspaper. A bench. You are the drop. You also leak.',
      },
      {
        title: 'Taxi getaway',
        blurb: 'You invert in the wind on purpose. It looks cool. It is not.',
      },
      {
        title: 'Cafe stakeout',
        blurb: 'In the stand with civilians. You pretend to be inventory.',
      },
      { title: 'Rooftop debrief', blurb: 'City lights. You shake off rain and three secrets.' },
    ],
  },
];

export function normalizeRoleplayTone(value: string | null | undefined): RoleplayTone {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  if (ROLEPLAY_TONE_IDS.has(trimmed)) {
    return trimmed as RoleplayTone;
  }
  return 'silly';
}

export function normalizeRoleplayContent(value: string | null | undefined): RoleplayContentId {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  return ROLEPLAY_CONTENT_ALIASES[trimmed] ?? 'pg13';
}

export function isRoleplayAdultContent(content: RoleplayContentId): boolean {
  return content === 'sultry' || content === 'explicit' || content === 'raunchy';
}

/** When the NSFW env lockout is off, adult ratings fall back to PG-13. */
export function clampRoleplayContentForAdultGate(
  content: RoleplayContentId,
  adultEnabled: boolean
): RoleplayContentId {
  if (!adultEnabled && isRoleplayAdultContent(content)) {
    return 'pg13';
  }
  return content;
}

export function normalizeRoleplayPlayAs(value: string | null | undefined): RoleplayPlayAs {
  const trimmed = String(value ?? '')
    .trim()
    .toLowerCase();
  if (
    trimmed === 'photo' ||
    trimmed === 'image' ||
    trimmed === 'img2img' ||
    trimmed === 'i2i' ||
    trimmed === 'reference'
  ) {
    return 'photo';
  }
  return 'text';
}

export function lastRoleplayStillImage(
  story: RoleplayStoryBeat[] | null | undefined
): { url: string; title: string } | null {
  for (let index = (story ?? []).length - 1; index >= 0; index -= 1) {
    const beat = story?.[index];
    if (!beat) {
      continue;
    }
    const url = lastCompletedRoleplayStillUrl(beat) || beat.imageUrl?.trim();
    if (!url) {
      continue;
    }
    return { url, title: beat.title.trim() || 'Still' };
  }
  return null;
}

export function resolveRoleplayToneAndContent(
  tone?: string | null,
  content?: string | null,
  options?: { adultEnabled?: boolean }
): { tone: RoleplayTone; content: RoleplayContentId } {
  const rawTone = String(tone ?? '')
    .trim()
    .toLowerCase();
  const hasContent = String(content ?? '').trim().length > 0;
  const resolved =
    !hasContent && LEGACY_ADULT_TONES.has(rawTone)
      ? {
          tone: 'silly' as const,
          content: normalizeRoleplayContent(rawTone === 'nsfw' ? 'explicit' : 'sultry'),
        }
      : {
          tone: normalizeRoleplayTone(rawTone),
          content: normalizeRoleplayContent(content),
        };
  if (options?.adultEnabled === false) {
    return {
      tone: resolved.tone,
      content: clampRoleplayContentForAdultGate(resolved.content, false),
    };
  }
  return resolved;
}

export function parseRoleplayAllowGore(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

export function getRoleplayArchetype(id: string | null | undefined): RoleplayArchetype | undefined {
  const key = String(id ?? '').trim();
  return ROLEPLAY_ARCHETYPES.find(entry => entry.id === key);
}

export function resolveRoleplayPersonaPrompt(
  personaId: string | null | undefined,
  customPersona?: string
): string {
  if (personaId === CUSTOM_ROLEPLAY_PERSONA_ID) {
    return customPersona?.trim() || 'an unexpected character with a secret inner life';
  }
  return (
    getRoleplayArchetype(personaId)?.prompt ??
    customPersona?.trim() ??
    ROLEPLAY_ARCHETYPES[0].prompt
  );
}

export function isRoleplayBioComplete(bio: Partial<RoleplayBio> | null | undefined): boolean {
  return Boolean(bio?.name?.trim() && bio.look?.trim() && bio.personality?.trim());
}

export function parseRoleplayBioFromText(
  text: string,
  fallbackName?: string | null
): RoleplayBio | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const labeled = (label: string): string => {
    const match = trimmed.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'im'));
    return match?.[1]?.trim() ?? '';
  };
  let name = labeled('name') || labeled('character');
  let look = labeled('look') || labeled('appearance');
  let personality = labeled('personality') || labeled('bio');
  const catchphrase = labeled('catchphrase') || labeled('phrase');
  if (!name || !look || !personality) {
    const lines = trimmed
      .split(/\n+/)
      .map(line =>
        line.replace(/^(name|look|appearance|personality|bio|catchphrase)\s*:\s*/i, '').trim()
      )
      .filter(Boolean);
    if (!name) {
      name = lines[0] ?? '';
    }
    if (!look) {
      look = lines[1] ?? '';
    }
    if (!personality) {
      personality = lines
        .slice(name && look ? 2 : 1)
        .join(' ')
        .trim();
    }
  }
  name = normalizeRoleplayCharacterName(name || fallbackName);
  look = look.trim();
  personality = personality.trim();
  if (!name || !look || !personality) {
    return null;
  }
  return {
    name,
    look: look.slice(0, 800),
    personality: personality.slice(0, 800),
    ...(catchphrase ? { catchphrase: catchphrase.slice(0, 160) } : {}),
  };
}

export function formatRoleplayBio(bio: RoleplayBio): string {
  const catchphrase = bio.catchphrase?.trim();
  return [
    bio.name.trim(),
    bio.look.trim(),
    bio.personality.trim(),
    catchphrase ? `Catchphrase: ${catchphrase}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function slugRoleplayExportPart(value: string, fallback = 'beat'): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

export function roleplayStillBasename(title: string, index: number): string {
  const n = String(index + 1).padStart(2, '0');
  return `${n}-${slugRoleplayExportPart(title)}`;
}

export function formatRoleplayStoryMarkdown(input: {
  bio?: RoleplayBio | null;
  story: RoleplayStoryBeat[];
  tone?: string;
  content?: string;
  personaLabel?: string;
  stillFilenames?: Array<string | null | undefined>;
  clipFilenames?: Array<string | null | undefined>;
  filmFilename?: string | null;
}): string {
  const name = input.bio?.name.trim() || 'Untitled roleplay';
  const tone = input.tone?.trim();
  const content = input.content?.trim();
  const persona = input.personaLabel?.trim();
  const lines: string[] = [`# ${name}`, ''];
  if (persona) {
    lines.push(`Part: ${persona}`, '');
  }
  if (tone) {
    lines.push(`Tone: ${tone}`, '');
  }
  if (content) {
    lines.push(`Content: ${content}`, '');
  }
  if (input.bio) {
    lines.push('## Character', '', formatRoleplayBio(input.bio), '');
  }
  if (input.story.length === 0) {
    lines.push('_No beats yet._', '');
    return lines.join('\n').trim() + '\n';
  }
  lines.push('## Story', '');
  input.story.forEach((beat, index) => {
    lines.push(`### ${index + 1}. ${beat.title.trim() || 'Beat'}`, '');
    if (beat.blurb.trim()) {
      lines.push(beat.blurb.trim(), '');
    }
    const stillName = input.stillFilenames?.[index]?.trim();
    if (stillName) {
      lines.push(`Still: \`stills/${stillName}\``, '');
    } else if (beat.stillStatus && beat.stillStatus !== 'completed') {
      lines.push(`Still: _${beat.stillStatus}_`, '');
    } else {
      lines.push('Still: _not captured_', '');
    }
    const clipName = input.clipFilenames?.[index]?.trim();
    if (clipName) {
      lines.push(`Clip: \`clips/${clipName}\``, '');
    } else if (beat.clipStatus && beat.clipStatus !== 'completed') {
      lines.push(`Clip: _${beat.clipStatus}_`, '');
    }
    if (beat.prompt?.trim()) {
      lines.push('Prompt:', '', '```', beat.prompt.trim(), '```', '');
    }
  });
  const filmName = input.filmFilename?.trim();
  if (filmName) {
    lines.push('## Film', '', `Assembled: \`${filmName}\``, '');
  }
  return lines.join('\n').trim() + '\n';
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slugId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${slug || 'scene'}-${index + 1}`;
}

export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const objectStart = raw.search(/[{[]/);
  if (objectStart < 0) {
    return null;
  }
  const opener = raw[objectStart];
  const closer = opener === '[' ? ']' : '}';
  const end = raw.lastIndexOf(closer);
  if (end <= objectStart) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(objectStart, end + 1));
  } catch {
    return null;
  }
}

export const MAX_ROLEPLAY_CHARACTER_NAME = 40;

export function normalizeRoleplayCharacterName(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ROLEPLAY_CHARACTER_NAME);
}

/** Only the Character name field locks a name. An existing bible must not. */
export function resolveRoleplayLockedCharacterName(
  characterName?: string | null
): string | undefined {
  return normalizeRoleplayCharacterName(characterName) || undefined;
}

const FRESH_ROLEPLAY_NAMES = [
  'Ivy Finch',
  'Rook Vale',
  'Sable Quinn',
  'Juniper Moss',
  'Theo Lark',
  'Nico Bramble',
  'Wren Hollow',
  'Pax Meridian',
  'Lumen Crowe',
  'Harlow Vetch',
];

export function normalizeAvoidedRoleplayNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = normalizeRoleplayCharacterName(value);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function pickFreshRoleplayName(
  avoid: Array<string | null | undefined> = [],
  pick: (max: number) => number = max => Math.floor(Math.random() * max)
): string {
  const blocked = new Set(normalizeAvoidedRoleplayNames(avoid).map(name => name.toLowerCase()));
  const pool = FRESH_ROLEPLAY_NAMES.filter(name => !blocked.has(name.toLowerCase()));
  const choices = pool.length > 0 ? pool : FRESH_ROLEPLAY_NAMES;
  return (
    choices[Math.max(0, Math.min(choices.length - 1, pick(choices.length)))] ?? 'The Unexpected'
  );
}

export function applyRoleplayCharacterName(
  bio: RoleplayBio,
  characterName?: string | null
): RoleplayBio {
  const name = normalizeRoleplayCharacterName(characterName);
  if (!name || bio.name === name) {
    return bio;
  }
  return { ...bio, name };
}

export function parseRoleplayBio(
  payload: unknown,
  fallback?: RoleplayBio,
  characterName?: string | null
): RoleplayBio {
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const name = readString(record?.name);
  const look = readString(record?.look) || readString(record?.appearance);
  const personality = readString(record?.personality) || readString(record?.bio);
  const catchphrase = readString(record?.catchphrase) || undefined;
  if (name && look && personality) {
    return applyRoleplayCharacterName(
      { name, look, personality, ...(catchphrase ? { catchphrase } : {}) },
      characterName
    );
  }
  if (fallback) {
    return applyRoleplayCharacterName(fallback, characterName);
  }
  return applyRoleplayCharacterName(ROLEPLAY_ARCHETYPES[0].templateBio, characterName);
}

export function parseRoleplayScenes(payload: unknown): RoleplayScene[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? Array.isArray((payload as { scenes?: unknown }).scenes)
        ? (payload as { scenes: unknown[] }).scenes
        : []
      : [];
  const scenes: RoleplayScene[] = [];
  for (const [index, row] of rows.entries()) {
    if (typeof row === 'string' && row.trim()) {
      scenes.push({ id: slugId(row, index), title: row.trim(), blurb: row.trim() });
      continue;
    }
    if (!row || typeof row !== 'object') {
      continue;
    }
    const record = row as Record<string, unknown>;
    const title = readString(record.title) || readString(record.name);
    const blurb = readString(record.blurb) || readString(record.summary) || title;
    if (!title) {
      continue;
    }
    scenes.push({ id: slugId(title, index), title, blurb });
  }
  return scenes.slice(0, 6);
}

export function templateRoleplayBio(
  personaId: string | null | undefined,
  customPersona?: string,
  characterName?: string | null,
  options?: { fresh?: boolean; avoidNames?: Array<string | null | undefined> }
): RoleplayBio {
  const archetype = getRoleplayArchetype(personaId);
  const base = archetype
    ? archetype.templateBio
    : {
        name: 'The Unexpected',
        look: resolveRoleplayPersonaPrompt(personaId, customPersona),
        personality: 'Here for a good time and a slightly confusing plot.',
        catchphrase: 'Okay but what if we made it weirder.',
      };
  const locked = resolveRoleplayLockedCharacterName(characterName);
  if (locked) {
    return applyRoleplayCharacterName(base, locked);
  }
  if (options?.fresh) {
    return {
      ...base,
      name: pickFreshRoleplayName([base.name, ...(options.avoidNames ?? [])]),
    };
  }
  return base;
}

export const ROLEPLAY_INTRO_SCENE_ID = 'intro-first-look';

function clipRoleplayWords(value: string, maxWords: number): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, Math.max(1, maxWords)).join(' ');
}

export function clipRoleplayTitle(value: string, maxWords = 6): string {
  return clipRoleplayWords(value.replace(/[:—–|/]+/g, ' '), maxWords) || 'Next beat';
}

export function roleplaySceneTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

const ROLEPLAY_SCENE_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'from',
  'into',
  'after',
  'during',
  'still',
  'you',
  'your',
  'they',
  'their',
  'this',
  'that',
  'than',
  'just',
  'what',
  'them',
  'then',
  'when',
  'who',
  'are',
  'was',
  'were',
  'has',
  'had',
  'have',
  'but',
  'not',
  'out',
  'off',
  'over',
  'under',
  'again',
  'next',
  'now',
  'too',
  'only',
  'same',
  'place',
  'moment',
  'beat',
  'scene',
]);

const ROLEPLAY_TITLE_DECOR = [
  'right after',
  'fallout from',
  'worse than',
  'double down on',
  'caught during',
  'bargain after',
  'escape from',
  'reveal during',
  'next room',
  'hours later',
  'uninvited guest',
  'wardrobe change',
  'night shift',
  'opposite play',
  'in public',
  'setpiece stunt',
];

export function roleplaySceneContentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3 && !ROLEPLAY_SCENE_STOPWORDS.has(word))
  );
}

export function roleplaySceneTokenOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.min(left.size, right.size);
}

export function roleplaySceneCoreTitle(title: string): string {
  let next = title
    .trim()
    .toLowerCase()
    .replace(/[:—–|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const prefix of ROLEPLAY_TITLE_DECOR) {
    if (next === prefix || next.startsWith(`${prefix} `)) {
      next = next.slice(prefix.length).trim();
      break;
    }
  }
  return next;
}

export function roleplayScenesTooSimilar(
  left: { title: string; blurb?: string },
  right: { title: string; blurb?: string }
): boolean {
  const leftBlurb = left.blurb?.trim().toLowerCase() ?? '';
  const rightBlurb = right.blurb?.trim().toLowerCase() ?? '';
  if (leftBlurb && leftBlurb === rightBlurb) {
    return true;
  }
  const leftCore = roleplaySceneCoreTitle(left.title);
  const rightCore = roleplaySceneCoreTitle(right.title);
  if (leftCore && leftCore === rightCore) {
    return true;
  }
  const leftTitle = roleplaySceneContentTokens(leftCore || left.title);
  const rightTitle = roleplaySceneContentTokens(rightCore || right.title);
  if (
    leftTitle.size >= 2 &&
    rightTitle.size >= 2 &&
    roleplaySceneTokenOverlap(leftTitle, rightTitle) >= 0.67
  ) {
    return true;
  }
  const leftAll = roleplaySceneContentTokens(`${left.title} ${left.blurb ?? ''}`);
  const rightAll = roleplaySceneContentTokens(`${right.title} ${right.blurb ?? ''}`);
  return (
    leftAll.size >= 5 && rightAll.size >= 5 && roleplaySceneTokenOverlap(leftAll, rightAll) >= 0.78
  );
}

export function usedRoleplaySceneTitles(story: Array<{ title: string }> | undefined): Set<string> {
  return new Set(
    (story ?? [])
      .flatMap(beat => [roleplaySceneTitleKey(beat.title), roleplaySceneCoreTitle(beat.title)])
      .filter(Boolean)
  );
}

export function lastRoleplayPlotBeat(
  story: RoleplayStoryBeat[] | undefined
): RoleplayStoryBeat | undefined {
  return (story ?? []).filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID).at(-1);
}

export const MAX_ROLEPLAY_REJECTED_SCENES = 24;

/** Keep unpicked cards across rolls so later forks do not resurface. */
export function mergeRoleplayRejectedScenes(
  prior: RoleplayScene[] | undefined,
  offered: RoleplayScene[] | undefined,
  chosen?: Pick<RoleplayScene, 'title'> | null
): RoleplayScene[] {
  const chosenKey = chosen ? roleplaySceneTitleKey(chosen.title) : '';
  const chosenCore = chosen ? roleplaySceneCoreTitle(chosen.title) : '';
  const next: RoleplayScene[] = [];
  const seen = new Set<string>();
  for (const scene of [...(prior ?? []), ...(offered ?? [])]) {
    const title = scene.title.trim();
    if (!title) {
      continue;
    }
    const key = roleplaySceneTitleKey(title);
    const core = roleplaySceneCoreTitle(title);
    if (!key || key === chosenKey || (chosenCore && core === chosenCore) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (core) {
      seen.add(core);
    }
    next.push({
      id: scene.id?.trim() || key,
      title,
      blurb: scene.blurb?.trim() || title,
    });
  }
  return next.slice(-MAX_ROLEPLAY_REJECTED_SCENES);
}

export function formatRoleplayAvoidedScenes(
  scenes: Array<{ title: string; blurb?: string }> | undefined
): string {
  const lines = (scenes ?? [])
    .map(scene => {
      const title = scene.title.trim();
      if (!title) {
        return '';
      }
      const blurb = scene.blurb?.trim();
      return blurb ? `- ${title} — ${blurb}` : `- ${title}`;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return '';
  }
  return `Already offered or played (do not repeat or paraphrase):\n${lines.join('\n')}`;
}

export function formatRoleplayStoryDigest(story: RoleplayStoryBeat[] | undefined): string {
  const recent = (story ?? []).slice(-8);
  const variety =
    'Four options must look like four different photographs: change the action, the place or time of day, and the pose. Do not offer the same tableau with a new verb.';
  if (recent.length === 0) {
    return [
      'Story so far: nothing yet — this is the opening beat. Write four opening options.',
      variety,
    ].join('\n');
  }
  const lines = recent.map((beat, index) => `${index + 1}. ${beat.title} — ${beat.blurb}`);
  const lastPlot = lastRoleplayPlotBeat(recent);
  const played = formatRoleplayAvoidedScenes(
    (story ?? []).filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID)
  );
  if (!lastPlot) {
    return [
      `Story so far:\n${lines.join('\n')}`,
      'Write four opening plot options — first things that can happen to this character.',
      variety,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `Story so far:\n${lines.join('\n')}`,
    `Last chosen beat (continue from here): ${lastPlot.title} — ${lastPlot.blurb}`,
    played,
    'Follow from that pick, but move the story: new room, later hour, new arrival, wardrobe change, or opposite tactic. Not four angles on the same still.',
    variety,
  ]
    .filter(Boolean)
    .join('\n');
}

type RoleplayContinuationFork = {
  titlePrefix: string;
  blurb: (name: string, last: RoleplayStoryBeat) => string;
};

const ROLEPLAY_CONTINUATION_FORKS: RoleplayContinuationFork[] = [
  {
    titlePrefix: 'Next room',
    blurb: (name, last) =>
      `${name} leaves "${last.title}" for an adjoining space, still carrying the problem: ${clipRoleplayWords(last.blurb, 14)}`,
  },
  {
    titlePrefix: 'Hours later',
    blurb: (name, last) =>
      `Later the same day, ${name} is somewhere else dealing with the fallout of ${last.title.toLowerCase()}.`,
  },
  {
    titlePrefix: 'Uninvited guest',
    blurb: (name, last) =>
      `A new person walks in on ${name} after ${last.title.toLowerCase()} and changes the power dynamic.`,
  },
  {
    titlePrefix: 'Wardrobe change',
    blurb: (name, last) =>
      `${name} changes clothes or gear after ${last.title.toLowerCase()} — new silhouette, same trouble.`,
  },
  {
    titlePrefix: 'Night shift',
    blurb: (name, last) =>
      `Light and weather flip. ${name} is still living with ${last.title.toLowerCase()}, but the still looks like a different movie.`,
  },
  {
    titlePrefix: 'Opposite play',
    blurb: (name, last) =>
      `${name} tries the opposite tactic of ${last.title.toLowerCase()} and it immediately complicates.`,
  },
  {
    titlePrefix: 'In public',
    blurb: (name, last) =>
      `The private mess of ${last.title.toLowerCase()} spills into a crowded or exposed place.`,
  },
  {
    titlePrefix: 'Setpiece stunt',
    blurb: (name, last) =>
      `${name} attempts a big physical bit that only makes sense because of ${last.title.toLowerCase()}.`,
  },
];

function uniqueRoleplayTitle(title: string, used: Set<string>): string {
  const base = clipRoleplayTitle(title);
  if (!used.has(roleplaySceneTitleKey(base))) {
    return base;
  }
  const stem = clipRoleplayWords(base, 5);
  for (const suffix of ['next', 'again', 'now', 'too']) {
    const candidate = clipRoleplayTitle(`${stem} ${suffix}`);
    if (!used.has(roleplaySceneTitleKey(candidate))) {
      return candidate;
    }
  }
  return stem;
}

export function continueRoleplayScenes(
  last: RoleplayStoryBeat,
  story?: RoleplayStoryBeat[],
  characterName?: string,
  avoid?: Array<{ title: string; blurb?: string }>
): RoleplayScene[] {
  const name = characterName?.trim() || 'You';
  const used = usedRoleplaySceneTitles([...(story ?? []), ...(avoid ?? [])]);
  const start = ((story?.length ?? 0) + (avoid?.length ?? 0)) % ROLEPLAY_CONTINUATION_FORKS.length;
  const rotated = [
    ...ROLEPLAY_CONTINUATION_FORKS.slice(start),
    ...ROLEPLAY_CONTINUATION_FORKS.slice(0, start),
  ];
  const scenes: RoleplayScene[] = [];
  for (const fork of rotated) {
    if (scenes.length >= 4) {
      break;
    }
    const title = uniqueRoleplayTitle(fork.titlePrefix, used);
    const scene = {
      id: slugId(title, scenes.length),
      title,
      blurb: fork.blurb(name, last),
    };
    if (
      [...(story ?? []), ...(avoid ?? []), ...scenes].some(prior =>
        roleplayScenesTooSimilar(scene, prior)
      )
    ) {
      continue;
    }
    used.add(roleplaySceneTitleKey(title));
    used.add(roleplaySceneCoreTitle(title));
    scenes.push(scene);
  }
  return scenes;
}

export function filterFreshRoleplayScenes(
  scenes: RoleplayScene[],
  story?: RoleplayStoryBeat[],
  avoid?: Array<{ title: string; blurb?: string }>
): RoleplayScene[] {
  const priors = [...(story ?? []), ...(avoid ?? [])];
  const used = usedRoleplaySceneTitles(priors);
  const seen = new Set<string>();
  const fresh: RoleplayScene[] = [];
  for (const scene of scenes) {
    const key = roleplaySceneTitleKey(scene.title);
    const core = roleplaySceneCoreTitle(scene.title);
    if (!key || used.has(key) || used.has(core) || seen.has(key) || seen.has(core)) {
      continue;
    }
    if ([...priors, ...fresh].some(prior => roleplayScenesTooSimilar(scene, prior))) {
      continue;
    }
    seen.add(key);
    if (core) {
      seen.add(core);
    }
    fresh.push(scene);
  }
  return fresh;
}

export function mergeRoleplaySceneOptions(
  preferred: RoleplayScene[],
  fallback: RoleplayScene[],
  story?: RoleplayStoryBeat[],
  limit = 4,
  avoid?: Array<{ title: string; blurb?: string }>
): RoleplayScene[] {
  const freshPreferred = filterFreshRoleplayScenes(preferred, story, avoid);
  const used = new Set([
    ...usedRoleplaySceneTitles([...(story ?? []), ...(avoid ?? [])]),
    ...freshPreferred.map(scene => roleplaySceneTitleKey(scene.title)),
    ...freshPreferred.map(scene => roleplaySceneCoreTitle(scene.title)),
  ]);
  const merged = [...freshPreferred];
  for (const extra of fallback) {
    if (merged.length >= limit) {
      break;
    }
    const key = roleplaySceneTitleKey(extra.title);
    const core = roleplaySceneCoreTitle(extra.title);
    if (!key || used.has(key) || used.has(core)) {
      continue;
    }
    if (
      [...(story ?? []), ...(avoid ?? []), ...merged].some(prior =>
        roleplayScenesTooSimilar(extra, prior)
      )
    ) {
      continue;
    }
    used.add(key);
    if (core) {
      used.add(core);
    }
    merged.push(extra);
  }
  return merged.slice(0, limit);
}

export function templateRoleplayScenes(
  personaId: string | null | undefined,
  customPersona?: string,
  story?: RoleplayStoryBeat[],
  characterName?: string,
  avoid?: Array<{ title: string; blurb?: string }>
): RoleplayScene[] {
  const lastPlot = lastRoleplayPlotBeat(story);
  if (lastPlot) {
    return continueRoleplayScenes(lastPlot, story, characterName, avoid);
  }
  const archetype = getRoleplayArchetype(personaId);
  const rows = archetype?.templateScenes ?? [
    {
      title: 'A door appears',
      blurb: `${resolveRoleplayPersonaPrompt(personaId, customPersona)} finds a door that was not there yesterday.`,
    },
    { title: 'Wrong weather', blurb: 'The sky is doing a bit. You decide to match its energy.' },
    {
      title: 'Side quest, unsolicited',
      blurb: 'A stranger hands you a quest and also a sandwich.',
    },
    { title: 'Quiet victory pose', blurb: 'Nothing happened, so you pose like it did.' },
  ];
  return filterFreshRoleplayScenes(
    rows.map((row, index) => ({
      id: slugId(row.title, index),
      title: row.title,
      blurb: row.blurb,
    })),
    story,
    avoid
  );
}

export function roleplayIntroScene(bio: RoleplayBio): RoleplayScene {
  const name = bio.name.trim() || 'the character';
  const look = bio.look.trim() || name;
  return {
    id: ROLEPLAY_INTRO_SCENE_ID,
    title: 'First look',
    blurb: `${name} in an establishing portrait: ${look}. Three-quarter or full figure, readable face or equivalent, one clear setting that matches the vibe, no extra plot yet.`,
  };
}

export const MAX_ROLEPLAY_STORY_BEATS = 12;

export function appendRoleplayStoryBeat(
  story: RoleplayStoryBeat[] | undefined,
  scene: RoleplayScene,
  extras?: Partial<
    Pick<
      RoleplayStoryBeat,
      'prompt' | 'promptId' | 'imageUrl' | 'stillStatus' | 'stillTakes' | 'stillTakeIndex'
    >
  >
): RoleplayStoryBeat[] {
  const next: RoleplayStoryBeat = { ...scene, at: Date.now(), ...extras };
  return [...(story ?? []), next].slice(-MAX_ROLEPLAY_STORY_BEATS);
}

export function patchRoleplayStoryBeat(
  story: RoleplayStoryBeat[] | undefined,
  match: Pick<RoleplayStoryBeat, 'id' | 'at'>,
  patch: Partial<RoleplayStoryBeat>
): RoleplayStoryBeat[] {
  return (story ?? []).map(beat =>
    beat.id === match.id && beat.at === match.at ? { ...beat, ...patch } : beat
  );
}

export type RoleplayGalleryStill = {
  promptId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  imageUrl?: string | null;
};

function stillStatusFromGallery(
  status: RoleplayGalleryStill['status']
): Exclude<RoleplayStillStatus, 'writing'> {
  if (status === 'pending') {
    return 'queued';
  }
  return status;
}

function takeHasStill(take: RoleplayStillTake): boolean {
  return Boolean(take.promptId?.trim() || take.imageUrl?.trim() || take.stillStatus);
}

function activeFieldsFromTake(
  take: RoleplayStillTake | undefined
): Pick<RoleplayStoryBeat, 'promptId' | 'imageUrl' | 'stillStatus'> {
  return {
    promptId: take?.promptId,
    imageUrl: take?.imageUrl,
    stillStatus: take?.stillStatus,
  };
}

export function roleplayStillTakes(beat: RoleplayStoryBeat): RoleplayStillTake[] {
  const stored = Array.isArray(beat.stillTakes) ? beat.stillTakes.filter(takeHasStill) : [];
  const current: RoleplayStillTake = {
    promptId: beat.promptId,
    imageUrl: beat.imageUrl,
    stillStatus: beat.stillStatus,
  };
  if (stored.length === 0) {
    return takeHasStill(current) ? [current] : [];
  }
  if (!takeHasStill(current)) {
    return stored.slice(-MAX_ROLEPLAY_STILL_TAKES);
  }
  const index =
    typeof beat.stillTakeIndex === 'number' &&
    Number.isInteger(beat.stillTakeIndex) &&
    beat.stillTakeIndex >= 0 &&
    beat.stillTakeIndex < stored.length
      ? beat.stillTakeIndex
      : stored.length - 1;
  const overlay = (take: RoleplayStillTake): RoleplayStillTake => ({
    promptId: current.promptId ?? take.promptId,
    imageUrl: current.imageUrl ?? take.imageUrl,
    stillStatus: current.stillStatus ?? take.stillStatus,
  });
  const currentId = current.promptId?.trim();
  if (currentId) {
    const found = stored.findIndex(take => take.promptId?.trim() === currentId);
    if (found >= 0) {
      return stored.map((take, takeIndex) => (takeIndex === found ? overlay(take) : take));
    }
    return [...stored, current].slice(-MAX_ROLEPLAY_STILL_TAKES);
  }
  return stored.map((take, takeIndex) => (takeIndex === index ? overlay(take) : take));
}

export function roleplayStillTakeIndex(beat: RoleplayStoryBeat): number {
  const takes = roleplayStillTakes(beat);
  if (takes.length === 0) {
    return 0;
  }
  if (
    typeof beat.stillTakeIndex === 'number' &&
    Number.isInteger(beat.stillTakeIndex) &&
    beat.stillTakeIndex >= 0 &&
    beat.stillTakeIndex < takes.length
  ) {
    return beat.stillTakeIndex;
  }
  const currentId = beat.promptId?.trim();
  if (currentId) {
    const found = takes.findIndex(take => take.promptId?.trim() === currentId);
    if (found >= 0) {
      return found;
    }
  }
  return takes.length - 1;
}

export function shownRoleplayStillTake(beat: RoleplayStoryBeat): RoleplayStillTake | undefined {
  const takes = roleplayStillTakes(beat);
  return takes[roleplayStillTakeIndex(beat)];
}

export function lastCompletedRoleplayStillUrl(beat: RoleplayStoryBeat): string | null {
  const takes = roleplayStillTakes(beat);
  for (let index = takes.length - 1; index >= 0; index -= 1) {
    const url = takes[index]?.stillStatus === 'completed' ? takes[index]?.imageUrl?.trim() : '';
    if (url) {
      return url;
    }
  }
  return beat.stillStatus === 'completed' ? beat.imageUrl?.trim() || null : null;
}

export function roleplayBeatPromptIds(beat: RoleplayStoryBeat): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const take of roleplayStillTakes(beat)) {
    const id = take.promptId?.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  const current = beat.promptId?.trim();
  if (current && !seen.has(current)) {
    ids.push(current);
  }
  const clipId = beat.clipPromptId?.trim();
  if (clipId && !seen.has(clipId)) {
    ids.push(clipId);
  }
  return ids;
}

export function roleplayStoryPromptIds(story: RoleplayStoryBeat[] | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const beat of story ?? []) {
    for (const id of roleplayBeatPromptIds(beat)) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

export function roleplayStillHasInFlightTake(beat: RoleplayStoryBeat): boolean {
  return roleplayStillTakes(beat).some(
    take =>
      take.stillStatus === 'writing' ||
      take.stillStatus === 'queued' ||
      take.stillStatus === 'running'
  );
}

export function canRetryRoleplayStill(beat: RoleplayStoryBeat): boolean {
  if (!beat.prompt?.trim() || roleplayStillHasInFlightTake(beat)) {
    return false;
  }
  return roleplayStillTakes(beat).some(
    take =>
      take.stillStatus === 'completed' ||
      take.stillStatus === 'error' ||
      Boolean(take.promptId?.trim()) ||
      Boolean(take.imageUrl?.trim())
  );
}

export function selectRoleplayStillTakePatch(
  beat: RoleplayStoryBeat,
  index: number
): Partial<RoleplayStoryBeat> {
  const takes = roleplayStillTakes(beat);
  if (takes.length === 0) {
    return {};
  }
  const nextIndex = Math.max(0, Math.min(takes.length - 1, Math.trunc(index)));
  return {
    stillTakes: takes,
    stillTakeIndex: nextIndex,
    ...activeFieldsFromTake(takes[nextIndex]),
  };
}

export function beginRoleplayStillRetryPatch(beat: RoleplayStoryBeat): Partial<RoleplayStoryBeat> {
  const previous = roleplayStillTakes(beat).filter(take =>
    Boolean(take.promptId?.trim() || take.imageUrl?.trim())
  );
  const capped = previous.slice(-(MAX_ROLEPLAY_STILL_TAKES - 1));
  const nextTakes: RoleplayStillTake[] = [...capped, { stillStatus: 'writing' }];
  return {
    stillTakes: nextTakes,
    stillTakeIndex: nextTakes.length - 1,
    promptId: undefined,
    imageUrl: undefined,
    stillStatus: 'writing',
  };
}

export function roleplayClipQueueResultPatch(
  promptId: string | undefined
): Partial<RoleplayStoryBeat> {
  if (!promptId) {
    return { clipStatus: 'error' };
  }
  return {
    clipPromptId: promptId,
    clipStatus: 'queued',
    clipUrl: undefined,
  };
}

export function roleplayStillQueueResultPatch(
  beat: RoleplayStoryBeat,
  promptId: string | undefined
): Partial<RoleplayStoryBeat> {
  const status: RoleplayStillStatus = promptId ? 'queued' : 'error';
  const takes = roleplayStillTakes(beat);
  const nextTake: RoleplayStillTake = { promptId, stillStatus: status };
  if (takes.length === 0) {
    return {
      stillTakes: [nextTake],
      stillTakeIndex: 0,
      promptId,
      imageUrl: undefined,
      stillStatus: status,
    };
  }
  const index = roleplayStillTakeIndex(beat);
  const nextTakes = takes.map((take, takeIndex) =>
    takeIndex === index ? { ...take, promptId, stillStatus: status } : take
  );
  return {
    stillTakes: nextTakes,
    stillTakeIndex: index,
    promptId,
    imageUrl: nextTakes[index]?.imageUrl,
    stillStatus: status,
  };
}

export function mergeRoleplayStoryStills(
  story: RoleplayStoryBeat[] | undefined,
  stills: RoleplayGalleryStill[]
): { story: RoleplayStoryBeat[]; changed: boolean } {
  const byPromptId = new Map(
    stills.map(entry => [entry.promptId.trim(), entry] as const).filter(([id]) => Boolean(id))
  );
  let changed = false;
  const next = (story ?? []).map(beat => {
    const takes = roleplayStillTakes(beat);
    let takeChanged = false;
    const updatedTakes = takes.map(take => {
      const id = take.promptId?.trim();
      if (!id) {
        return take;
      }
      const match = byPromptId.get(id);
      if (!match) {
        return take;
      }
      const imageUrl = match.imageUrl?.trim() || take.imageUrl;
      const stillStatus = stillStatusFromGallery(match.status);
      if (take.imageUrl === imageUrl && take.stillStatus === stillStatus) {
        return take;
      }
      takeChanged = true;
      return { ...take, imageUrl, stillStatus };
    });
    const clipId = beat.clipPromptId?.trim();
    const clipMatch = clipId ? byPromptId.get(clipId) : undefined;
    const clipUrl = clipMatch?.imageUrl?.trim() || beat.clipUrl;
    const clipStatus = clipMatch ? stillStatusFromGallery(clipMatch.status) : beat.clipStatus;
    const clipChanged = Boolean(
      clipMatch && (clipUrl !== beat.clipUrl || clipStatus !== beat.clipStatus)
    );

    if (!takeChanged && !clipChanged) {
      return beat;
    }
    changed = true;
    const indexedBeat = { ...beat, stillTakes: updatedTakes };
    const index = roleplayStillTakeIndex(indexedBeat);
    const shown = updatedTakes[index];
    return {
      ...beat,
      ...(updatedTakes.length > 0
        ? {
            stillTakes: updatedTakes,
            stillTakeIndex: index,
            ...activeFieldsFromTake(shown),
          }
        : {}),
      ...(clipChanged ? { clipUrl, clipStatus } : {}),
    };
  });
  return { story: next, changed };
}
