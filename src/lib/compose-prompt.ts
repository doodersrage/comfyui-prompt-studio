import type { CustomWorkflowToken, WorkflowParamValues } from './comfyui-config';
import {
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
} from './comfyui-config';
import { isFluxKleinModel, isQwenEditModel } from './model-denoise-defaults';
import { buildQwenEditPrompt, parseQwenEditSegments } from './qwen-edit-builder';
import {
  MAX_INPUT_IMAGE_FILENAMES,
  normalizeInputImageFilenames,
} from './workflow-load-image-bindings';

const KLEIN_MODIFY_PRESERVE_PREFIX =
  'Keep the subject’s pose and framing unchanged unless asked otherwise.';

/** Qwen ReferenceLatent + VL image1 anchor pose — override in prompt when refactoring. */
const QWEN_POSE_UNLOCK_MODIFY_PREFIX =
  'Use Figure 1 for facial identity and likeness only. Do not preserve the original body pose, sitting/standing framing, camera angle, or background — generate a new pose and scene as described.';

const QWEN_POSE_UNLOCK_TRANSFER_PREFIX =
  'Figure 1 is facial identity only — ignore Figure 1 body pose and framing. Figure 2 supplies the target pose, action, and body energy; use additional figures for wardrobe, environment, or mood as described.';

/** Prompts that intend to replace pose/scene, not gentle edits on Figure 1 framing. */
export function isAggressiveComposeInstruction(instruction: string): boolean {
  const lower = instruction.trim().toLowerCase();
  if (!lower) {
    return false;
  }
  if (/\baggressively refactor\b/.test(lower)) {
    return true;
  }
  if (/\bfull (?:athlete|hero) refactor\b/.test(lower)) {
    return true;
  }
  if (/\bbeast mode\b/.test(lower)) {
    return true;
  }
  if (/\breplace everything else\b/.test(lower)) {
    return true;
  }
  if (/\bkeep facial likeness only\b/.test(lower)) {
    return true;
  }
  if (/\bidentity only\b/.test(lower) && /\breplace\b/.test(lower)) {
    return true;
  }
  return false;
}

export const COMPOSE_DEFAULT_MODEL = 'qwen-image-edit-2511-lightning-8' as const;

export const MAX_COMPOSE_FIGURES = MAX_INPUT_IMAGE_FILENAMES;

export type ComposeMode = 'transfer' | 'modify';

export { isComposeCapableModel } from './model-denoise-defaults';
export { normalizeInputImageFilenames };

const FIGURE_LABEL_RE = /\b(?:figure|image|ref|picture|photo)\s*[1-4]\b/i;

const MULTI_INPUT_IMAGE_TOKENS = [
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
] as const;

/** Sync `inputImageFilename` + `inputImageFilenames` on queue params. */
export function applyInputImageFilenamesToParams(
  params: WorkflowParamValues,
  filenames: string[]
): WorkflowParamValues {
  const next = { ...params };
  const normalized = filenames
    .map(entry => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPOSE_FIGURES);
  if (normalized.length === 0) {
    delete next.inputImageFilename;
    delete next.inputImageFilenames;
    return next;
  }
  next.inputImageFilename = normalized[0];
  next.inputImageFilenames = normalized;
  return next;
}

export function multiInputImageCustomTokens(filenames: string[]): CustomWorkflowToken[] {
  const tokens: CustomWorkflowToken[] = [];
  for (let i = 0; i < MULTI_INPUT_IMAGE_TOKENS.length; i += 1) {
    const value = filenames[i]?.trim();
    if (!value) {
      continue;
    }
    tokens.push({ token: MULTI_INPUT_IMAGE_TOKENS[i], value });
  }
  return tokens;
}

export function inputImageTokenForFigureIndex(index: number): string {
  return MULTI_INPUT_IMAGE_TOKENS[index] ?? DEFAULT_INPUT_IMAGE_TOKEN;
}

export type ComposeStarterTemplate = {
  id: string;
  label: string;
  instruction: string;
  /** Minimum uploaded figures required (default 1 for modify, 2 for transfer). */
  minFigures?: number;
};

export type ComposeTemplateGroup = {
  id: string;
  label: string;
  templates: ComposeStarterTemplate[];
};

export const COMPOSE_TRANSFER_TEMPLATE_GROUPS: ComposeTemplateGroup[] = [
  {
    id: 'wardrobe',
    label: 'Wardrobe & appearance',
    templates: [
      {
        id: 'outfit',
        label: 'Outfit transfer',
        instruction:
          'Keep the pose and framing from Figure 1. Replace the outfit with the jacket style from Figure 2, matching lighting.',
      },
      {
        id: 'hair',
        label: 'Hair style',
        instruction:
          'Keep face, pose, and body from Figure 1. Apply the hair style, length, and color from Figure 2 with natural roots and lighting match.',
      },
      {
        id: 'makeup',
        label: 'Makeup look',
        instruction:
          'Keep identity and pose from Figure 1. Apply the makeup style from Figure 2 — eyes, lips, and skin finish — without changing bone structure.',
      },
      {
        id: 'accessories',
        label: 'Accessories',
        instruction:
          'Keep the subject from Figure 1 unchanged. Add the glasses, hat, or jewelry from Figure 2 with correct scale, shadows, and perspective.',
      },
      {
        id: 'footwear',
        label: 'Footwear swap',
        instruction:
          'Keep pose and outfit from Figure 1. Replace shoes with the footwear from Figure 2, matching ground contact and shadow.',
      },
      {
        id: 'fabric-texture',
        label: 'Fabric / texture',
        instruction:
          'Keep the garment cut and pose from Figure 1. Apply the fabric weave, pattern, and material sheen from Figure 2.',
      },
    ],
  },
  {
    id: 'scene',
    label: 'Scene & environment',
    templates: [
      {
        id: 'background',
        label: 'Background transfer',
        instruction:
          'Keep the person from Figure 1 unchanged in identity, pose, and proportions. Replace the background with the environment from Figure 2, matching perspective and lighting so both sources read as one scene.',
      },
      {
        id: 'sky',
        label: 'Sky replacement',
        instruction:
          'Keep the foreground subject and geometry from Figure 1. Replace only the sky with the clouds and color grade from Figure 2, matching horizon line and light direction.',
      },
      {
        id: 'indoor-outdoor',
        label: 'Indoor → outdoor',
        instruction:
          'Keep the subject from Figure 1. Place them in the outdoor location from Figure 2 with matched sun angle, color temperature, and ground reflections.',
      },
      {
        id: 'season',
        label: 'Season / weather',
        instruction:
          'Keep identity and pose from Figure 1. Apply the season, foliage, and weather mood from Figure 2 (snow, rain, autumn leaves, etc.).',
      },
      {
        id: 'time-of-day',
        label: 'Time of day',
        instruction:
          'Keep the subject from Figure 1. Relight the scene to match the time of day and sky from Figure 2 (golden hour, blue hour, or night).',
      },
    ],
  },
  {
    id: 'objects',
    label: 'Objects & props',
    templates: [
      {
        id: 'subject-object',
        label: 'Object transfer',
        instruction:
          'Keep the scene and lighting from Figure 1. Add the object from Figure 2 into Figure 1 with matching scale, perspective, and shadows.',
      },
      {
        id: 'product-in-hand',
        label: 'Product in hand',
        instruction:
          'Keep the person from Figure 1. Place the product from Figure 2 naturally in their hand with correct grip, scale, and specular highlights.',
      },
      {
        id: 'prop-swap',
        label: 'Prop swap',
        instruction:
          'Keep pose and environment from Figure 1. Replace the held prop with the item from Figure 2, preserving hand position and contact shadows.',
      },
      {
        id: 'vehicle',
        label: 'Vehicle / large prop',
        instruction:
          'Keep the environment tone from Figure 1. Integrate the vehicle or large object from Figure 2 with matched perspective, scale, and ground shadow.',
        minFigures: 2,
      },
    ],
  },
  {
    id: 'look',
    label: 'Look & style',
    templates: [
      {
        id: 'lighting-mood',
        label: 'Lighting / mood',
        instruction:
          'Keep subject identity and composition from Figure 1. Apply the lighting direction, contrast, and color mood from Figure 2 across the whole frame.',
      },
      {
        id: 'color-palette',
        label: 'Color palette',
        instruction:
          'Keep structure and subject from Figure 1. Transfer the overall color palette and grade from Figure 2 without shifting skin tone unnaturally.',
      },
      {
        id: 'film-camera',
        label: 'Film / camera look',
        instruction:
          'Keep the scene content from Figure 1. Apply the grain, lens character, and color science from Figure 2 (35mm, vintage, or digital cinema).',
      },
      {
        id: 'art-style',
        label: 'Art style',
        instruction:
          'Keep the layout and subjects from Figure 1. Render in the illustrative or painterly style of Figure 2 while preserving readable faces and anatomy.',
      },
    ],
  },
  {
    id: 'pose-identity',
    label: 'Pose & identity',
    templates: [
      {
        id: 'pose-ref',
        label: 'Pose reference',
        instruction:
          'Keep face identity and outfit from Figure 1. Match the body pose and limb placement from Figure 2 without changing who the person is.',
      },
      {
        id: 'face-blend',
        label: 'Likeness emphasis',
        instruction:
          'Keep pose and scene from Figure 1. Strengthen facial likeness toward Figure 2 while keeping lighting consistent with Figure 1.',
      },
      {
        id: 'expression',
        label: 'Expression transfer',
        instruction:
          'Keep identity and pose from Figure 1. Apply the facial expression and gaze direction from Figure 2.',
      },
    ],
  },
  {
    id: 'sport',
    label: 'Sport & athletic',
    templates: [
      {
        id: 'team-kit',
        label: 'Team kit / jersey',
        instruction:
          'Keep face, body proportions, and pose from Figure 1. Apply the team jersey, shorts, and kit colors from Figure 2 with correct logos, fabric stretch, and lighting match.',
      },
      {
        id: 'athletic-pose',
        label: 'Athletic pose',
        instruction:
          'Keep identity and outfit from Figure 1. Match the dynamic athletic pose and limb tension from Figure 2 (mid-kick, sprint, jump, or follow-through).',
      },
      {
        id: 'running-pose',
        label: 'Running stride',
        instruction:
          'Keep face, body, and kit from Figure 1. Match the running stride from Figure 2 — forward lean, arm drive, knee lift, and foot strike — without changing identity.',
      },
      {
        id: 'cycling-pose',
        label: 'Cycling action',
        instruction:
          'Keep identity from Figure 1. Match the on-bike posture from Figure 2 — aerodynamic tuck, pedaling leg position, hands on drops or hoods, and head angle.',
      },
      {
        id: 'running-route',
        label: 'Running route / trail',
        instruction:
          'Person from figure 1 is running. Place them on the road, track, or trail environment from Figure 2 with matched perspective, surface texture, and daylight.',
      },
      {
        id: 'cycling-kit',
        label: 'Cycling kit / bib',
        instruction:
          'Keep face, pose, and bike position from Figure 1. Apply the cycling jersey, bib shorts, and helmet from Figure 2 with correct Lycra stretch, logos, and specular highlights.',
      },
      {
        id: 'cycling-scene',
        label: 'Cycling scene',
        instruction:
          'Keep the cyclist from Figure 1. Replace the background with the road, mountain pass, or urban ride scene from Figure 2, including believable motion blur and pavement detail.',
      },
      {
        id: 'run-cycle-composite',
        label: 'Action + course',
        instruction:
          'Keep athlete identity from Figure 1. Match the running or cycling action from Figure 2 and place on the course or landscape from Figure 3 with unified lighting.',
        minFigures: 3,
      },
      {
        id: 'stadium-bg',
        label: 'Stadium / arena',
        instruction:
          'Keep the athlete from Figure 1 unchanged. Place them in the stadium or arena environment from Figure 2 with matched crowd depth, field markings, and stadium lighting.',
      },
      {
        id: 'court-field',
        label: 'Court / field surface',
        instruction:
          'Keep the subject and action from Figure 1. Replace the ground with the court, turf, or track surface from Figure 2, including line markings and realistic contact shadows.',
      },
      {
        id: 'sports-equipment',
        label: 'Equipment swap',
        instruction:
          'Keep pose and athlete from Figure 1. Replace the ball, racket, bat, or gear with the equipment from Figure 2, preserving grip, scale, and motion blur direction.',
      },
      {
        id: 'celebration-pose',
        label: 'Victory celebration',
        instruction:
          'Keep identity and kit from Figure 1. Apply the celebration pose and emotional energy from Figure 2 (arms raised, fist pump, or team embrace).',
      },
      {
        id: 'sports-action-composite',
        label: 'Action + venue',
        instruction:
          'Keep athlete identity and kit from Figure 1. Match the action pose from Figure 2 and place into the venue and crowd atmosphere from Figure 3.',
        minFigures: 3,
      },
      {
        id: 'sport-aggressive-refactor',
        label: 'Full athlete refactor',
        instruction:
          'Aggressively refactor while keeping face and identity from Figure 1. Replace everything else — sport, kit, pose energy, equipment, venue, crowd, lighting, and color grade — using the athletic world and intensity from Figure 2 as the blueprint.',
      },
      {
        id: 'sport-poster-takeover',
        label: 'Poster takeover',
        instruction:
          'Keep facial likeness from Figure 1 only. Aggressively refactor into a premium sports poster — new dynamic action, pro kit, dramatic stadium or arena, sweat and motion blur, bold rim light, and punchy grade inspired by Figure 2.',
      },
      {
        id: 'sport-discipline-swap',
        label: 'Discipline swap',
        instruction:
          'Aggressively refactor while keeping identity from Figure 1. Replace the entire discipline and scene — swap sport, gear, body language, and environment for the athletic context shown in Figure 2 (runner, cyclist, fighter, climber, etc.).',
      },
      {
        id: 'sport-epic-triple',
        label: 'Identity + action + arena',
        instruction:
          'Keep face and identity from Figure 1 only. Aggressively refactor action and kit from Figure 2 and the venue, crowd, and epic lighting from Figure 3 — maximum athletic spectacle, unified scene.',
        minFigures: 3,
      },
    ],
  },
  {
    id: 'fantasy',
    label: 'Fantasy & adventure',
    templates: [
      {
        id: 'fantasy-armor',
        label: 'Armor & wardrobe',
        instruction:
          'Keep face, pose, and proportions from Figure 1. Apply the fantasy armor, cloak, or adventurer outfit from Figure 2 with believable metal wear, leather creases, and matched lighting.',
      },
      {
        id: 'fantasy-realm',
        label: 'Realm / setting',
        instruction:
          'Keep the character from Figure 1 unchanged. Replace the background with the fantasy realm from Figure 2 — castles, ruins, enchanted forest, or alien vista — with unified light direction.',
      },
      {
        id: 'fantasy-art-style',
        label: 'Fantasy art style',
        instruction:
          'Keep composition and character layout from Figure 1. Render in the high-fantasy illustration or concept-art style of Figure 2 while keeping faces and anatomy readable.',
      },
      {
        id: 'creature-companion',
        label: 'Creature companion',
        instruction:
          'Keep the hero from Figure 1. Add the creature or mount from Figure 2 beside them with matched scale, ground shadow, and shared ambient light.',
      },
      {
        id: 'magic-effects',
        label: 'Magic / VFX',
        instruction:
          'Keep identity and pose from Figure 1. Apply the spell effects, glowing runes, or elemental energy from Figure 2 as practical light sources on skin and surroundings.',
      },
      {
        id: 'fantasy-weapon',
        label: 'Weapon / artifact',
        instruction:
          'Keep pose and character from Figure 1. Replace or add the fantasy weapon or artifact from Figure 2 with correct hand grip, weight, and specular highlights.',
      },
      {
        id: 'hero-scene-composite',
        label: 'Hero + realm + FX',
        instruction:
          'Keep character identity and pose from Figure 1. Apply armor from Figure 2, place into the realm from Figure 3, and match the magical mood and color grade from Figure 4.',
        minFigures: 4,
      },
      {
        id: 'fantasy-aggressive-refactor',
        label: 'Full hero refactor',
        instruction:
          'Aggressively refactor while keeping face and identity from Figure 1. Replace everything else — costume, weapons, creatures, realm, weather, magic VFX, and color grade — using the fantasy world and tone from Figure 2 as the blueprint.',
      },
      {
        id: 'fantasy-class-takeover',
        label: 'Class / archetype takeover',
        instruction:
          'Keep facial likeness from Figure 1 only. Aggressively refactor into a new fantasy archetype inspired by Figure 2 — warrior, mage, rogue, druid, or celestial knight — with full wardrobe, props, and environment to match.',
      },
      {
        id: 'fantasy-realm-overhaul',
        label: 'Realm overhaul',
        instruction:
          'Aggressively refactor while keeping identity from Figure 1. Replace outfit, mount, companions, ruins, sky, and magical effects with the epic realm and mood from Figure 2 — commit fully, only the person stays.',
      },
      {
        id: 'fantasy-legend-triple',
        label: 'Hero + armor + realm',
        instruction:
          'Keep face and identity from Figure 1 only. Aggressively refactor armor and weapons from Figure 2 and the realm, creatures, and spell FX from Figure 3 — legend-tier fantasy, unified lighting.',
        minFigures: 3,
      },
    ],
  },
  {
    id: 'transforms',
    label: 'Aggressive & fun',
    templates: [
      {
        id: 'style-takeover',
        label: 'Wild style takeover',
        instruction:
          'Keep the subject layout and pose from Figure 1. Aggressively refactor the entire look using the bold art style, texture, and energy from Figure 2 — push contrast, color, and attitude to the max while keeping the person recognizable.',
      },
      {
        id: 'chaos-energy',
        label: 'Chaos energy',
        instruction:
          'Keep identity and pose from Figure 1. Detonate the scene with the chaotic particles, sparks, smoke, and kinetic VFX mood from Figure 2 — high impact, loud color, and cinematic motion.',
      },
      {
        id: 'neon-overload',
        label: 'Neon overload',
        instruction:
          'Keep the subject from Figure 1. Aggressively refactor into a neon-drenched cyberpunk fever dream using the glow palette and urban mood from Figure 2 — hot pinks, electric blues, wet reflections, and razor-sharp rim light.',
      },
      {
        id: 'character-mashup',
        label: 'Character mashup',
        instruction:
          'Keep pose and framing from Figure 1. Fuse identity with the outrageous costume, makeup, or character design from Figure 2 — commit fully, no half measures, matched lighting on both sources.',
      },
      {
        id: 'absurd-prop',
        label: 'Absurd prop combo',
        instruction:
          'Keep the person from Figure 1. Add the ridiculous oversized prop or creature from Figure 2 with playful scale exaggeration, bold shadows, and comedic confidence.',
      },
      {
        id: 'party-explosion',
        label: 'Party explosion',
        instruction:
          'Keep identity and pose from Figure 1. Aggressively refactor the scene into a confetti-and-laser party explosion using the festive color blast and energy from Figure 2.',
        minFigures: 2,
      },
      {
        id: 'triple-chaos',
        label: 'Subject + style + chaos',
        instruction:
          'Keep subject and pose from Figure 1. Apply the wild wardrobe from Figure 2 and the explosive background/VFX mood from Figure 3 — maximum fun, unified lighting.',
        minFigures: 3,
      },
    ],
  },
  {
    id: 'multi',
    label: 'Multi-figure composites',
    templates: [
      {
        id: 'three-way',
        label: 'Style + subject',
        instruction:
          'Keep pose from Figure 1, apply the outfit from Figure 2, and place the subject into the environment from Figure 3.',
        minFigures: 3,
      },
      {
        id: 'group-scene',
        label: 'Group into scene',
        instruction:
          'Combine subjects from Figure 1 and Figure 2 into the environment from Figure 3. Match scale, eyelines, and shared lighting.',
        minFigures: 3,
      },
      {
        id: 'four-way',
        label: 'Four-figure composite',
        instruction:
          'Use Figure 1 for main subject and pose, Figure 2 for wardrobe, Figure 3 for background, Figure 4 for overall color grade and mood.',
        minFigures: 4,
      },
      {
        id: 'wardrobe-and-bg',
        label: 'Outfit + background',
        instruction:
          'Keep pose and identity from Figure 1. Apply outfit from Figure 2 and background from Figure 3 with unified lighting.',
        minFigures: 3,
      },
    ],
  },
];

export const COMPOSE_MODIFY_TEMPLATE_GROUPS: ComposeTemplateGroup[] = [
  {
    id: 'structured',
    label: 'Structured edits',
    templates: [
      {
        id: 'keep-replace',
        label: 'Keep / replace',
        instruction: [
          'keep: subject face, pose, and proportions',
          'replace: background with a rainy neon alley at night',
          'add: steam rising from sidewalk grates',
          'remove: visible logos and text',
        ].join('\n'),
      },
      {
        id: 'cleanup',
        label: 'Cleanup pass',
        instruction: [
          'keep: subject identity, pose, and outfit',
          'remove: background clutter, wires, and stray objects',
          'replace: background with clean soft bokeh',
        ].join('\n'),
      },
      {
        id: 'wardrobe-tweak',
        label: 'Outfit tweak only',
        instruction: [
          'keep: face, hair, pose, and background',
          'replace: shirt color with deep navy',
          'add: subtle fabric wrinkles',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'lighting',
    label: 'Lighting & color',
    templates: [
      {
        id: 'lighting',
        label: 'Golden-hour relight',
        instruction:
          'Keep the subject identity, pose, and framing from Figure 1. Replace the lighting with soft golden-hour side light and warmer skin tones.',
      },
      {
        id: 'studio-light',
        label: 'Studio lighting',
        instruction:
          'Keep identity and pose from Figure 1. Relight as a three-point studio portrait with soft key, gentle fill, and subtle rim light.',
      },
      {
        id: 'night-scene',
        label: 'Night scene',
        instruction:
          'Keep the subject from Figure 1. Convert to a night scene with practical lights, moonlit ambient, and believable shadow falloff.',
      },
      {
        id: 'cinematic-grade',
        label: 'Cinematic grade',
        instruction:
          'Keep composition and subject from Figure 1. Apply a teal-and-orange cinematic color grade with controlled contrast and filmic highlights.',
      },
      {
        id: 'soft-portrait',
        label: 'Soft portrait glow',
        instruction:
          'Keep identity and pose from Figure 1. Add soft diffused portrait lighting, gentle skin smoothing, and creamy background falloff.',
      },
    ],
  },
  {
    id: 'environment',
    label: 'Environment',
    templates: [
      {
        id: 'bg-replace',
        label: 'Background replace',
        instruction:
          'Keep the subject from Figure 1 exactly — identity, pose, and edges. Replace the background with a misty pine forest at dawn, matched perspective.',
      },
      {
        id: 'weather-rain',
        label: 'Rain / wet streets',
        instruction:
          'Keep the subject from Figure 1. Add rain, wet pavement reflections, and overcast soft lighting without changing identity.',
      },
      {
        id: 'weather-snow',
        label: 'Snow / winter',
        instruction:
          'Keep identity and pose from Figure 1. Add snowfall, cold breath, and winter ambient light while preserving skin realism.',
      },
    ],
  },
  {
    id: 'sport',
    label: 'Sport & athletic',
    templates: [
      {
        id: 'sport-action-freeze',
        label: 'Action freeze',
        instruction:
          'Keep identity and kit from Figure 1. Enhance mid-action athletic energy — sharper muscle definition, subtle motion blur on limbs, and sweat sheen under stadium lights.',
      },
      {
        id: 'sport-sprint',
        label: 'Sprint stride',
        instruction:
          'Keep identity and outfit from Figure 1. Shift into an explosive sprint — strong forward lean, high knee drive, pumping arms, and subtle motion blur on legs.',
      },
      {
        id: 'sport-trail-run',
        label: 'Trail run',
        instruction:
          'Aggressively refactor the subject from the source image into a powerful, dynamic running action. Replace the background with a forest trail or mountain path, dappled daylight, dust kick-up, and natural uneven ground.',
      },
      {
        id: 'sport-road-run',
        label: 'Road / marathon',
        instruction:
          'Aggressively refactor the subject from the source image into a powerful, dynamic running action. Place on a city marathon course with road markings, cheering crowd bokeh, and bright midday sun.',
      },
      {
        id: 'sport-road-cycling',
        label: 'Road cycling',
        instruction:
          'Keep identity from Figure 1. Add road bike, aerodynamic kit, and pedaling posture on a winding asphalt climb with heat shimmer and distant valley.',
      },
      {
        id: 'sport-mtb',
        label: 'Mountain biking',
        instruction:
          'Keep face and body from Figure 1. Add mountain bike, helmet, and aggressive off-road stance on a rocky singletrack with mud spray and forest backdrop.',
      },
      {
        id: 'sport-cycling-kit',
        label: 'Cycling kit',
        instruction: [
          'keep: face, pose, and bike position',
          'replace: jersey and bib with pro team kit and matching helmet',
          'add: subtle sweat sheen and realistic Lycra compression folds',
        ].join('\n'),
      },
      {
        id: 'sport-jersey-swap',
        label: 'Jersey swap',
        instruction: [
          'keep: face, hair, pose, and body proportions',
          'replace: jersey and shorts with home team colors and number 10',
          'add: realistic fabric wrinkles and sponsor-less chest',
        ].join('\n'),
      },
      {
        id: 'sport-stadium',
        label: 'Stadium background',
        instruction:
          'Keep the athlete from Figure 1 exactly. Replace the background with a packed night stadium, turf field markings, and dramatic sideline lighting.',
      },
      {
        id: 'sport-rain-match',
        label: 'Rain match atmosphere',
        instruction:
          'Keep identity, pose, and kit from Figure 1. Add rain-soaked pitch, misty floodlights, and wet kit sheen without changing who the athlete is.',
      },
      {
        id: 'sport-portrait-poster',
        label: 'Sports poster look',
        instruction:
          'Keep the athlete from Figure 1. Grade like a premium sports poster — high contrast, crisp rim light, subtle vignette, and bold color punch.',
      },
      {
        id: 'sport-aggressive-refactor',
        label: 'Full athlete refactor',
        instruction:
          'Aggressively refactor while keeping face and identity from the source image. Replace everything else — sport, kit, pose, muscles in action, equipment, stadium or course, crowd energy, weather, and grade — push maximum athletic spectacle.',
      },
      {
        id: 'sport-beast-mode',
        label: 'Beast mode',
        instruction:
          'Keep facial likeness only. Aggressively refactor into peak beast-mode athletics — veins-and-sweat intensity, explosive mid-action pose, pro kit, roaring crowd blur, and hard stadium strobes.',
      },
      {
        id: 'sport-underdog-epic',
        label: 'Underdog epic',
        instruction:
          'Aggressively refactor while keeping identity. Replace mundane setting with an epic championship moment — spotlight, confetti, trophy glow, torn kit detail, and cinematic slow-motion energy.',
      },
      {
        id: 'sport-rain-warrior',
        label: 'Rain warrior',
        instruction:
          'Keep face and identity only. Aggressively refactor into a rain-soaked battle-on-the-pitch scene — mud spray, floodlights cutting through mist, soaked kit clinging, and raw competitive fury.',
      },
      {
        id: 'sport-endurance-legend',
        label: 'Endurance legend',
        instruction:
          'Aggressively refactor while keeping identity. Replace the whole scene with an ultra-endurance legend shot — mountain pass or desert highway, heat shimmer, chalk and salt on skin, brutal sun, and heroic fatigue.',
      },
    ],
  },
  {
    id: 'fantasy',
    label: 'Fantasy & adventure',
    templates: [
      {
        id: 'fantasy-env',
        label: 'Enchanted environment',
        instruction:
          'Keep the subject from Figure 1. Replace the background with a floating crystal archipelago at sunset, matched light direction on the subject.',
      },
      {
        id: 'fantasy-armor-add',
        label: 'Add armor',
        instruction:
          'Keep face, hair, and pose from Figure 1. Add layered fantasy plate and leather armor with weathered edges, buckles, and realistic metal reflections.',
      },
      {
        id: 'fantasy-wings',
        label: 'Wings / ethereal',
        instruction:
          'Keep identity and pose from Figure 1. Add large luminous wings with soft translucency and cast colored light onto shoulders and hair.',
      },
      {
        id: 'fantasy-castle',
        label: 'Medieval castle',
        instruction:
          'Keep the character from Figure 1. Replace the background with a misty medieval castle on a cliff, torches, and overcast epic sky — matched perspective.',
      },
      {
        id: 'fantasy-magic-glow',
        label: 'Arcane glow',
        instruction:
          'Keep identity and pose from Figure 1. Add floating runes, hand-held magical glow, and cool blue-violet spill light on face and armor.',
      },
      {
        id: 'fantasy-creature',
        label: 'Add companion creature',
        instruction:
          'Keep the hero from Figure 1. Add a dragon or wolf companion at their side with matched scale, contact shadow, and shared moody lighting.',
      },
      {
        id: 'fantasy-epic-portrait',
        label: 'Epic portrait grade',
        instruction:
          'Keep identity and costume from Figure 1. Apply epic fantasy color grade — rich shadows, golden rim light, subtle atmospheric haze, and painterly depth.',
      },
      {
        id: 'fantasy-aggressive-refactor',
        label: 'Full hero refactor',
        instruction:
          'Aggressively refactor while keeping face and identity from the source image. Replace everything else — armor, cloak, weapons, wings, creatures, ruins, sky, spell FX, and color grade — commit to legend-tier fantasy.',
      },
      {
        id: 'fantasy-dark-overhaul',
        label: 'Dark fantasy overhaul',
        instruction:
          'Keep facial likeness only. Aggressively refactor into dark fantasy — blackened plate, cursed runes, storm-wracked citadel, ember sparks, and cold moon rim light. Identity stays; the world turns grim.',
      },
      {
        id: 'fantasy-dragon-rider',
        label: 'Dragon rider',
        instruction:
          'Aggressively refactor while keeping identity. Replace outfit, mount, and environment with a dragon-rider epic — scale armor, wind-torn cape, colossal dragon shoulder, volcanic vista, and fire-lit clouds.',
      },
      {
        id: 'fantasy-fae-court',
        label: 'Fae court',
        instruction:
          'Keep face and identity only. Aggressively refactor into an enchanted fae court — iridescent gown or armor, bioluminescent forest, floating pollen light, antler crown or arcane jewelry, and surreal color.',
      },
      {
        id: 'fantasy-storm-caller',
        label: 'Storm caller',
        instruction:
          'Aggressively refactor while keeping identity. Replace everything with a storm-caller climax — lightning forks, swirling cloak, levitating debris, rain and ozone glow, and thunderhead cathedral sky.',
      },
    ],
  },
  {
    id: 'transforms',
    label: 'Aggressive & fun',
    templates: [
      {
        id: 'aggressive-refactor',
        label: 'Full aggressive refactor',
        instruction:
          'Aggressively refactor the subject from the source image — amplify attitude, contrast, and visual punch. Push pose energy, styling, and background into a bold, fun, unapologetic new version while keeping them recognizable.',
      },
      {
        id: 'neon-cyberpunk',
        label: 'Neon cyberpunk',
        instruction:
          'Aggressively refactor into neon cyberpunk chaos — hot magenta and cyan glow, wet asphalt reflections, holographic billboards, and razor rim light. Keep the subject readable and fierce.',
      },
      {
        id: 'pop-art-blast',
        label: 'Pop art blast',
        instruction:
          'Aggressively refactor into a pop-art explosion — halftone dots, thick outlines, saturated primaries, and comic-book energy. Fun, loud, and graphic.',
      },
      {
        id: 'cartoon-exaggerate',
        label: 'Cartoon exaggeration',
        instruction:
          'Aggressively refactor into a fun cartoon exaggeration — bigger eyes, bolder shapes, elastic motion lines, and playful color without losing who they are.',
      },
      {
        id: 'superhero-landing',
        label: 'Superhero landing',
        instruction:
          'Aggressively refactor into a superhero power-up moment — dynamic low-angle pose, cape or coat motion, crater cracks, dust burst, and epic backlight.',
      },
      {
        id: 'disco-party',
        label: 'Disco party',
        instruction:
          'Aggressively refactor into a disco fever scene — mirror ball shards, laser streaks, sequined outfit sheen, and saturated party colors. Pure fun.',
      },
      {
        id: 'punk-makeover',
        label: 'Punk makeover',
        instruction: [
          'keep: face structure recognizable',
          'replace: outfit with ripped leather, studs, and bold patches',
          'add: messy dyed hair, graffiti wall background, and harsh flash lighting',
        ].join('\n'),
      },
      {
        id: 'surreal-giant',
        label: 'Surreal scale fun',
        instruction:
          'Aggressively refactor with surreal playful scale — tiny subject among giant everyday objects OR giant subject in a miniature world. Whimsical, bold, and visually surprising.',
      },
      {
        id: 'glitch-chaos',
        label: 'Glitch chaos',
        instruction:
          'Aggressively refactor with digital glitch chaos — RGB splits, scan lines, datamosh streaks, and neon error blocks. Edgy, fun, and high energy.',
      },
      {
        id: 'anime-power-up',
        label: 'Anime power-up',
        instruction:
          'Aggressively refactor into an anime power-up scene — speed lines, aura glow, wind-blown hair and clothes, and dramatic sky. Keep facial likeness intact.',
      },
      {
        id: 'candy-surreal',
        label: 'Candy surreal',
        instruction:
          'Aggressively refactor into a candy-colored surreal dream — glossy pinks and purples, fluffy clouds, oversized lollipops or donuts, and playful lighting. Sweet but bold.',
      },
      {
        id: 'action-movie-poster',
        label: 'Action movie poster',
        instruction:
          'Aggressively refactor into a over-the-top action movie poster — low-angle hero framing, fire and debris, lens flare, title-ready negative space, and teal-orange grade.',
      },
      {
        id: 'zombie-fun',
        label: 'Spooky fun (light)',
        instruction:
          'Aggressively refactor into playful spooky fun — stylized undead makeup, green mood light, fog, and campy horror energy. Keep it fun, not grotesque.',
      },
    ],
  },
  {
    id: 'add-remove',
    label: 'Add & remove',
    templates: [
      {
        id: 'add-object',
        label: 'Add object',
        instruction:
          'Keep the subject and scene from Figure 1. Add a vintage leather satchel on the ground beside them with matching shadow and perspective.',
      },
      {
        id: 'remove-object',
        label: 'Remove object',
        instruction:
          'Keep the subject and environment from Figure 1. Remove the distracting sign and trash can; inpaint plausible background continuation.',
      },
      {
        id: 'add-accessory',
        label: 'Add accessory',
        instruction:
          'Keep face, pose, and outfit from Figure 1. Add thin gold-rim glasses with realistic reflections and face shadow.',
      },
    ],
  },
  {
    id: 'subject',
    label: 'Subject tweaks',
    templates: [
      {
        id: 'expression',
        label: 'Expression change',
        instruction:
          'Keep identity, hair, and pose from Figure 1. Change expression to a subtle confident smile with relaxed eyes.',
      },
      {
        id: 'age-younger',
        label: 'De-age slightly',
        instruction:
          'Keep pose and outfit from Figure 1. Subtly soften skin texture and brighten eyes — about five years younger, still the same person.',
      },
      {
        id: 'anatomy-repair',
        label: 'Hand / anatomy repair',
        instruction:
          'Keep identity, pose, and scene from Figure 1. Fix distorted hands and fingers to anatomically correct proportions with natural skin detail.',
      },
      {
        id: 'detail-sharpen',
        label: 'Detail sharpen',
        instruction:
          'Keep composition from Figure 1. Enhance eye, hair, and fabric micro-detail without changing identity or adding plastic skin.',
      },
    ],
  },
];

export const COMPOSE_TRANSFER_TEMPLATES: ComposeStarterTemplate[] =
  COMPOSE_TRANSFER_TEMPLATE_GROUPS.flatMap(group => group.templates);

export const COMPOSE_MODIFY_TEMPLATES: ComposeStarterTemplate[] =
  COMPOSE_MODIFY_TEMPLATE_GROUPS.flatMap(group => group.templates);

/**
 * Transfer (≥2 figs): auto-prefix Figure labels when the user omitted them.
 * Modify: expand keep/replace lines via qwen-edit-builder when present.
 */
export function buildComposeInstruction(input: {
  mode: ComposeMode;
  instruction: string;
  figureCount: number;
  /** When Klein, Modify prompts get a preserve-composition prefix for CLIP img2img. */
  model?: string;
}): string {
  const raw = input.instruction.trim();
  if (!raw) {
    return '';
  }

  if (input.mode === 'modify') {
    let text = raw;
    if (/^(keep|replace|add|remove)\s*:/im.test(raw)) {
      const built = buildQwenEditPrompt(parseQwenEditSegments(raw));
      text = built || raw;
    }
    if (isFluxKleinModel(input.model)) {
      if (text.toLowerCase().startsWith('edit the input image')) {
        return text;
      }
      return `${KLEIN_MODIFY_PRESERVE_PREFIX} ${text}`;
    }
    if (
      isQwenEditModel(input.model ?? '') &&
      isAggressiveComposeInstruction(raw) &&
      !/\bfacial identity only\b/i.test(text)
    ) {
      return `${QWEN_POSE_UNLOCK_MODIFY_PREFIX} ${text}`;
    }
    return text;
  }

  let transferText = raw;
  if (
    isQwenEditModel(input.model ?? '') &&
    input.figureCount >= 2 &&
    isAggressiveComposeInstruction(raw) &&
    !/\bfacial identity only\b/i.test(raw)
  ) {
    transferText = `${QWEN_POSE_UNLOCK_TRANSFER_PREFIX} ${raw}`;
  }

  if (FIGURE_LABEL_RE.test(transferText) || input.figureCount < 2) {
    return transferText;
  }

  const labels = Array.from(
    { length: Math.min(input.figureCount, MAX_COMPOSE_FIGURES) },
    (_, i) => `Figure ${i + 1}`
  ).join(', ');
  return `Using ${labels}: ${transferText}`;
}

export function composeFigureCountFromFilenames(
  filenames: Array<string | undefined | null> | undefined
): number {
  return (filenames ?? []).filter(entry => Boolean(entry?.trim())).length;
}
