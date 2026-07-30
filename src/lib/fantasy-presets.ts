import type { FantasyPresetOptions } from './fantasy-options';

export type FantasyPresetCategory =
  'character' | 'creature' | 'environment' | 'epic' | 'dark' | 'fairy' | 'celestial';

export type FantasyPreset = {
  id: string;
  label: string;
  hints: string;
  category: FantasyPresetCategory;
  presetOptions?: Partial<FantasyPresetOptions>;
};

export const FANTASY_PRESET_CATEGORIES: {
  value: FantasyPresetCategory | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'character', label: 'Characters' },
  { value: 'creature', label: 'Creatures' },
  { value: 'environment', label: 'Environments' },
  { value: 'epic', label: 'Epic' },
  { value: 'dark', label: 'Dark' },
  { value: 'fairy', label: 'Fairy tale' },
  { value: 'celestial', label: 'Celestial' },
];

export const FANTASY_PRESETS: readonly FantasyPreset[] = [
  {
    id: 'knight-ruins',
    label: 'Knight at ruins',
    hints: 'battle-worn knight standing before overgrown ancient ruins at dusk',
    category: 'character',
    presetOptions: {
      focus: 'character',
      subjectRole: 'knight',
      settingArchetype: 'ancient-ruins',
      subgenre: 'high-fantasy',
      timeOfDay: 'dusk',
    },
  },
  {
    id: 'wizard-tower',
    label: 'Wizard spell',
    hints: 'robed wizard channeling arcane sigils in a floating tower observatory',
    category: 'character',
    presetOptions: {
      focus: 'character',
      subjectRole: 'wizard',
      settingArchetype: 'floating-castle',
      magicElement: 'arcane-glow',
      cameraAngle: 'low-hero',
    },
  },
  {
    id: 'elf-ranger-forest',
    label: 'Elf ranger',
    hints: 'elven ranger poised in an enchanted forest with bow drawn',
    category: 'character',
    presetOptions: {
      focus: 'character',
      subjectRole: 'elf-ranger',
      settingArchetype: 'enchanted-forest',
      atmosphere: 'serene',
      lightingStyle: 'god-rays',
    },
  },
  {
    id: 'witch-cottage',
    label: 'Witch cottage',
    hints: 'witch brewing a glowing potion outside a mossy cottage',
    category: 'character',
    presetOptions: {
      focus: 'character',
      subjectRole: 'witch',
      settingArchetype: 'witch-cottage',
      subgenre: 'fairy-tale',
      magicElement: 'fairy-dust',
    },
  },
  {
    id: 'oracle-moon',
    label: 'Oracle under moon',
    hints: 'blind oracle with ritual robes under a blood moon',
    category: 'character',
    presetOptions: {
      focus: 'character',
      subjectRole: 'oracle',
      magicElement: 'blood-moon',
      atmosphere: 'mystical',
      subgenre: 'mythic',
    },
  },
  {
    id: 'dragon-lair',
    label: 'Dragon on hoard',
    hints: 'massive dragon coiled atop a glittering treasure hoard',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'dragon',
      settingArchetype: 'dragon-lair',
      scale: 'monumental',
      lightingStyle: 'torchlight',
    },
  },
  {
    id: 'phoenix-rebirth',
    label: 'Phoenix rebirth',
    hints: 'phoenix erupting in embers above shattered obsidian stones',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'phoenix',
      magicElement: 'fire-runes',
      atmosphere: 'epic',
      colorPalette: 'ember-gold',
    },
  },
  {
    id: 'forest-golem',
    label: 'Rune golem',
    hints: 'stone golem awakening in a crystal cavern with glowing seams',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'golem',
      settingArchetype: 'crystal-cavern',
      magicElement: 'arcane-glow',
    },
  },
  {
    id: 'fairy-grove',
    label: 'Fairy in grove',
    hints: 'tiny luminous fairy hovering in a hidden mushroom grove',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'fairy',
      settingArchetype: 'fairy-grove',
      subgenre: 'fairy-tale',
      magicElement: 'fairy-dust',
    },
  },
  {
    id: 'demon-gate',
    label: 'Demon at gate',
    hints: 'horned demon standing before a volcanic shrine gate',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'demon',
      settingArchetype: 'volcanic-shrine',
      subgenre: 'dark-fantasy',
      atmosphere: 'ominous',
    },
  },
  {
    id: 'enchanted-forest-empty',
    label: 'Enchanted forest',
    hints: 'empty enchanted forest with glowing mushrooms and mist, no figures',
    category: 'environment',
    presetOptions: {
      focus: 'environment',
      settingArchetype: 'enchanted-forest',
      atmosphere: 'mystical',
      lightingStyle: 'bioluminescent',
    },
  },
  {
    id: 'floating-castle-vista',
    label: 'Floating castle',
    hints: 'empty floating castle above cloud seas at eternal twilight, no people',
    category: 'environment',
    presetOptions: {
      focus: 'environment',
      settingArchetype: 'floating-castle',
      timeOfDay: 'eternal-twilight',
      scale: 'monumental',
      subgenre: 'high-fantasy',
    },
  },
  {
    id: 'ice-palace-halls',
    label: 'Ice palace',
    hints: 'empty ice palace halls with frozen waterfalls and blue refractions',
    category: 'environment',
    presetOptions: {
      focus: 'environment',
      settingArchetype: 'ice-palace',
      colorPalette: 'monochrome-blue',
      lightingStyle: 'moonlight',
    },
  },
  {
    id: 'underdark-glow',
    label: 'Underdark cavern',
    hints: 'empty underdark cavern with bioluminescent fungi and still black water',
    category: 'environment',
    presetOptions: {
      focus: 'environment',
      settingArchetype: 'underdark',
      lightingStyle: 'bioluminescent',
      atmosphere: 'ominous',
    },
  },
  {
    id: 'celestial-spire-empty',
    label: 'Celestial spire',
    hints: 'empty celestial spire piercing star fields, no figures',
    category: 'environment',
    presetOptions: {
      focus: 'environment',
      settingArchetype: 'celestial-spire',
      subgenre: 'celestial',
      scale: 'monumental',
    },
  },
  {
    id: 'battlefield-dawn',
    label: 'Battlefield dawn',
    hints: 'knight and wizard facing each other on a misty mythic battlefield at dawn',
    category: 'epic',
    presetOptions: {
      focus: 'ensemble',
      settingArchetype: 'battlefield',
      atmosphere: 'epic',
      timeOfDay: 'dawn',
      scale: 'grand',
    },
  },
  {
    id: 'dragon-rider',
    label: 'Dragon rider',
    hints: 'armored rider on a dragon soaring above storm clouds',
    category: 'epic',
    presetOptions: {
      focus: 'ensemble',
      subjectRole: 'dragon',
      atmosphere: 'epic',
      lightingStyle: 'storm-light',
      scale: 'grand',
    },
  },
  {
    id: 'siege-gate',
    label: 'Siege at gate',
    hints: 'three heroes bracing before a shattered castle gate during magical siege',
    category: 'epic',
    presetOptions: {
      focus: 'ensemble',
      settingArchetype: 'ancient-ruins',
      magicElement: 'lightning',
      scale: 'grand',
      subgenre: 'sword-sorcery',
    },
  },
  {
    id: 'astral-duel',
    label: 'Astral duel',
    hints: 'two mages dueling on a floating rune platform above an astral rift',
    category: 'epic',
    presetOptions: {
      focus: 'ensemble',
      magicElement: 'astral-rift',
      atmosphere: 'chaotic',
      cameraAngle: 'low-hero',
    },
  },
  {
    id: 'necromancer-ritual',
    label: 'Necromancer ritual',
    hints: 'necromancer raising green mist over cracked tombstones',
    category: 'dark',
    presetOptions: {
      focus: 'character',
      subjectRole: 'wizard',
      magicElement: 'necrotic-mist',
      subgenre: 'dark-fantasy',
      atmosphere: 'ominous',
    },
  },
  {
    id: 'eldritch-ruins',
    label: 'Eldritch ruins',
    hints: 'impossible black ruins under a writhing blood moon, no visible people',
    category: 'dark',
    presetOptions: {
      focus: 'environment',
      subgenre: 'eldritch',
      magicElement: 'blood-moon',
      atmosphere: 'ominous',
    },
  },
  {
    id: 'infernal-throne',
    label: 'Infernal throne',
    hints: 'demon lord seated on an obsidian throne wreathed in smoke',
    category: 'dark',
    presetOptions: {
      focus: 'character',
      subjectRole: 'demon',
      settingArchetype: 'volcanic-shrine',
      subgenre: 'dark-fantasy',
      lightingStyle: 'rim-lit',
    },
  },
  {
    id: 'cursed-forest',
    label: 'Cursed forest',
    hints: 'witch walking through a cursed forest of thorned trees and black fog',
    category: 'dark',
    presetOptions: {
      focus: 'character',
      subjectRole: 'witch',
      settingArchetype: 'enchanted-forest',
      atmosphere: 'ominous',
      colorPalette: 'muted-earth',
    },
  },
  {
    id: 'storybook-bridge',
    label: 'Storybook bridge',
    hints: 'fairy tale knight crossing a mossy bridge toward a tiny glowing castle',
    category: 'fairy',
    presetOptions: {
      focus: 'character',
      subjectRole: 'knight',
      subgenre: 'fairy-tale',
      atmosphere: 'whimsical',
      colorPalette: 'jewel-tones',
    },
  },
  {
    id: 'tea-with-fairy',
    label: 'Fairy tea scene',
    hints: 'whimsical fairy tea party on giant mushroom caps in a sunlit grove',
    category: 'fairy',
    presetOptions: {
      focus: 'ensemble',
      settingArchetype: 'fairy-grove',
      subgenre: 'fairy-tale',
      atmosphere: 'whimsical',
      magicElement: 'fairy-dust',
    },
  },
  {
    id: 'enchanted-library',
    label: 'Enchanted library',
    hints: 'young wizard reading a floating spellbook in a cozy enchanted library',
    category: 'fairy',
    presetOptions: {
      focus: 'character',
      subjectRole: 'wizard',
      subgenre: 'fairy-tale',
      atmosphere: 'whimsical',
      lightingStyle: 'torchlight',
    },
  },
  {
    id: 'angel-spire',
    label: 'Angel on spire',
    hints: 'winged angel standing on a celestial spire above the clouds',
    category: 'celestial',
    presetOptions: {
      focus: 'character',
      subjectRole: 'angel',
      settingArchetype: 'celestial-spire',
      subgenre: 'celestial',
      magicElement: 'holy-light',
    },
  },
  {
    id: 'star-oracle',
    label: 'Star oracle',
    hints: 'oracle silhouetted against a starfield portal on a mountain summit',
    category: 'celestial',
    presetOptions: {
      focus: 'character',
      subjectRole: 'oracle',
      subgenre: 'celestial',
      magicElement: 'astral-rift',
      timeOfDay: 'midnight',
    },
  },
  {
    id: 'celestial-battle',
    label: 'Celestial clash',
    hints: 'angel and demon locked in radiant combat above broken clouds',
    category: 'celestial',
    presetOptions: {
      focus: 'ensemble',
      subgenre: 'celestial',
      magicElement: 'holy-light',
      atmosphere: 'epic',
      scale: 'monumental',
    },
  },
  {
    id: 'moonlit-hunt',
    label: 'Moonlit hunt',
    hints: 'elf ranger tracking a luminous beast through moonlit ruins',
    category: 'epic',
    presetOptions: {
      focus: 'ensemble',
      subjectRole: 'elf-ranger',
      settingArchetype: 'ancient-ruins',
      timeOfDay: 'midnight',
      lightingStyle: 'moonlight',
    },
  },
  {
    id: 'steampunk-golem',
    label: 'Clockwork golem',
    hints: 'brass clockwork golem in a steampunk fantasy workshop',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'golem',
      subgenre: 'steampunk-fantasy',
      magicElement: 'arcane-glow',
    },
  },
  {
    id: 'mythic-beast-lake',
    label: 'Lake beast',
    hints: 'massive mythic beast rising from a mirror-still mountain lake at dawn',
    category: 'creature',
    presetOptions: {
      focus: 'creature',
      subjectRole: 'beast',
      subgenre: 'mythic',
      timeOfDay: 'dawn',
      scale: 'monumental',
    },
  },
  {
    id: 'volcanic-shrine-pilgrim',
    label: 'Shrine pilgrim',
    hints: 'lone pilgrim approaching a volcanic shrine through ash fall',
    category: 'character',
    presetOptions: {
      focus: 'character',
      settingArchetype: 'volcanic-shrine',
      atmosphere: 'mystical',
      colorPalette: 'ember-gold',
    },
  },
  {
    id: 'crystal-mage',
    label: 'Crystal mage',
    hints: 'mage suspended among floating ice crystals in a cavern cathedral',
    category: 'character',
    presetOptions: {
      focus: 'character',
      subjectRole: 'wizard',
      settingArchetype: 'crystal-cavern',
      magicElement: 'ice-crystals',
      cameraAngle: 'low-hero',
    },
  },
  {
    id: 'feywild-procession',
    label: 'Fey procession',
    hints: 'small fey procession crossing a glowing forest stream at twilight',
    category: 'fairy',
    presetOptions: {
      focus: 'ensemble',
      settingArchetype: 'fairy-grove',
      timeOfDay: 'dusk',
      magicElement: 'nature-vines',
      atmosphere: 'whimsical',
    },
  },
  {
    id: 'storm-wizard',
    label: 'Storm wizard',
    hints: 'wizard commanding lightning above a cliffside battlefield',
    category: 'epic',
    presetOptions: {
      focus: 'character',
      subjectRole: 'wizard',
      magicElement: 'lightning',
      settingArchetype: 'battlefield',
      lightingStyle: 'storm-light',
      atmosphere: 'chaotic',
    },
  },
];

export function getFantasyPreset(id: string): FantasyPreset | undefined {
  return FANTASY_PRESETS.find(preset => preset.id === id);
}

export function fantasyPresetsForCategory(
  category: FantasyPresetCategory | 'all' = 'all'
): FantasyPreset[] {
  if (category === 'all') {
    return [...FANTASY_PRESETS];
  }

  return FANTASY_PRESETS.filter(preset => preset.category === category);
}
