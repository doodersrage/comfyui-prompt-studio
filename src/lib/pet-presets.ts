import type { PetPresetOptions } from './pet-options';

export type PetPresetCategory = 'dog' | 'cat' | 'bird' | 'rabbit' | 'small';

export type PetPreset = {
  id: string;
  label: string;
  hints: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  pair?: boolean;
  category: PetPresetCategory;
  presetOptions?: Partial<PetPresetOptions>;
};

export const PET_PRESET_CATEGORIES: {
  value: PetPresetCategory | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'dog', label: 'Dogs' },
  { value: 'cat', label: 'Cats' },
  { value: 'bird', label: 'Birds' },
  { value: 'rabbit', label: 'Rabbits' },
  { value: 'small', label: 'Small pets' },
];

export const PET_PRESETS: readonly PetPreset[] = [
  {
    id: 'golden-retriever-park',
    label: 'Golden retriever park',
    hints: 'golden retriever playing fetch in a sunny dog park',
    portraitStyle: 'action',
    category: 'dog',
    presetOptions: { species: 'dog', activity: 'fetching', settingVibe: 'dog-park' },
  },
  {
    id: 'lab-puppy-portrait',
    label: 'Lab puppy portrait',
    hints: 'yellow labrador puppy with soft floppy ears',
    portraitStyle: 'portrait',
    category: 'dog',
    presetOptions: {
      species: 'dog',
      ageStage: 'baby',
      expression: 'curious',
      cameraAngle: 'close-up-macro',
    },
  },
  {
    id: 'corgi-sprint',
    label: 'Corgi sprint',
    hints: 'pembroke corgi sprinting through autumn leaves',
    portraitStyle: 'action',
    category: 'dog',
    presetOptions: { species: 'dog', activity: 'running', coatStyle: 'short-smooth' },
  },
  {
    id: 'french-bulldog-cafe',
    label: 'French bulldog café',
    hints: 'french bulldog sitting on a café patio chair',
    portraitStyle: 'full-body',
    category: 'dog',
    presetOptions: { species: 'dog', settingVibe: 'cafe-patio', accessory: 'bandana' },
  },
  {
    id: 'border-collie-agility',
    label: 'Border collie agility',
    hints: 'border collie leaping over an agility hurdle',
    portraitStyle: 'action',
    category: 'dog',
    presetOptions: { species: 'dog', activity: 'jumping', expression: 'alert' },
  },
  {
    id: 'husky-snow',
    label: 'Husky in snow',
    hints: 'siberian husky standing in fresh snow with breath visible',
    portraitStyle: 'full-body',
    category: 'dog',
    presetOptions: { species: 'dog', settingVibe: 'snow-yard', coatStyle: 'seasonal-thick' },
  },
  {
    id: 'beagle-trail',
    label: 'Beagle trail',
    hints: 'beagle sniffing a forest trail with ears flopping',
    portraitStyle: 'action',
    category: 'dog',
    presetOptions: { species: 'dog', activity: 'exploring', settingVibe: 'forest-trail' },
  },
  {
    id: 'poodle-studio',
    label: 'Poodle studio',
    hints: 'well-groomed standard poodle in a clean portrait studio',
    portraitStyle: 'portrait',
    category: 'dog',
    presetOptions: {
      species: 'dog',
      coatStyle: 'curly',
      settingVibe: 'studio',
      lightingStyle: 'studio-softbox',
    },
  },
  {
    id: 'dachshund-couch',
    label: 'Dachshund on couch',
    hints: 'long-haired dachshund curled on a cozy sofa',
    portraitStyle: 'full-body',
    category: 'dog',
    presetOptions: {
      species: 'dog',
      activity: 'resting',
      settingVibe: 'living-room',
      expression: 'sleepy',
    },
  },
  {
    id: 'german-shepherd-guard',
    label: 'German shepherd alert',
    hints: 'german shepherd standing alert in a backyard at dusk',
    portraitStyle: 'full-body',
    category: 'dog',
    presetOptions: {
      species: 'dog',
      expression: 'alert',
      settingVibe: 'backyard',
      lightingStyle: 'golden-hour',
    },
  },
  {
    id: 'shiba-autumn',
    label: 'Shiba in autumn',
    hints: 'shiba inu with curled tail among fallen maple leaves',
    portraitStyle: 'full-body',
    category: 'dog',
    presetOptions: { species: 'dog', coatStyle: 'short-smooth', settingVibe: 'garden' },
  },
  {
    id: 'dalmatian-run',
    label: 'Dalmatian run',
    hints: 'dalmatian running along a beach boardwalk',
    portraitStyle: 'action',
    category: 'dog',
    presetOptions: {
      species: 'dog',
      coatStyle: 'spotted',
      activity: 'running',
      settingVibe: 'beach',
    },
  },
  {
    id: 'two-dogs-play',
    label: 'Two dogs playing',
    hints: 'two dogs playing tug with a rope toy in a backyard',
    portraitStyle: 'action',
    pair: true,
    category: 'dog',
    presetOptions: { species: 'dog', pairMode: 'pair', activity: 'playing', accessory: 'toy-rope' },
  },
  {
    id: 'senior-lab-portrait',
    label: 'Senior lab portrait',
    hints: 'senior chocolate lab with gentle gray muzzle',
    portraitStyle: 'portrait',
    category: 'dog',
    presetOptions: {
      species: 'dog',
      ageStage: 'senior',
      expression: 'calm',
      cameraAngle: 'shallow-dof-portrait',
    },
  },
  {
    id: 'aussie-frisbee',
    label: 'Aussie frisbee',
    hints: 'australian shepherd catching a frisbee mid-air',
    portraitStyle: 'action',
    category: 'dog',
    presetOptions: { species: 'dog', activity: 'jumping', coatStyle: 'tricolor' },
  },
  {
    id: 'tabby-window',
    label: 'Tabby at window',
    hints: 'tabby cat curled on a sunlit windowsill watching birds',
    portraitStyle: 'portrait',
    category: 'cat',
    presetOptions: {
      species: 'cat',
      settingVibe: 'windowsill',
      expression: 'curious',
      lightingStyle: 'soft-window',
    },
  },
  {
    id: 'maine-coon-portrait',
    label: 'Maine coon portrait',
    hints: 'fluffy maine coon cat with tufted ears and amber eyes',
    portraitStyle: 'portrait',
    category: 'cat',
    presetOptions: { species: 'cat', coatStyle: 'long-fluffy', cameraAngle: 'close-up-macro' },
  },
  {
    id: 'ragdoll-sofa',
    label: 'Ragdoll on sofa',
    hints: 'ragdoll cat lounging on a soft sofa with relaxed paws',
    portraitStyle: 'full-body',
    category: 'cat',
    presetOptions: {
      species: 'cat',
      activity: 'resting',
      settingVibe: 'living-room',
      expression: 'calm',
    },
  },
  {
    id: 'siamese-studio',
    label: 'Siamese studio',
    hints: 'siamese cat with dark points in a neutral studio portrait',
    portraitStyle: 'portrait',
    category: 'cat',
    presetOptions: { species: 'cat', settingVibe: 'studio', lightingStyle: 'studio-softbox' },
  },
  {
    id: 'black-cat-halloween',
    label: 'Black cat night',
    hints: 'sleek black cat with bright green eyes on a moonlit porch',
    portraitStyle: 'portrait',
    category: 'cat',
    presetOptions: {
      species: 'cat',
      coatStyle: 'monochrome',
      expression: 'mischievous',
      lightingStyle: 'cozy-lamp',
    },
  },
  {
    id: 'bengal-leap',
    label: 'Bengal leap',
    hints: 'bengal cat leaping toward a dangling toy',
    portraitStyle: 'action',
    category: 'cat',
    presetOptions: { species: 'cat', coatStyle: 'striped', activity: 'jumping' },
  },
  {
    id: 'kitten-basket',
    label: 'Kitten in basket',
    hints: 'tiny tabby kitten nestled in a woven basket',
    portraitStyle: 'portrait',
    category: 'cat',
    presetOptions: { species: 'cat', ageStage: 'baby', activity: 'cuddling', expression: 'sleepy' },
  },
  {
    id: 'two-cats-play',
    label: 'Two cats playing',
    hints: 'two playful cats batting at a toy in a living room',
    portraitStyle: 'action',
    pair: true,
    category: 'cat',
    presetOptions: {
      species: 'cat',
      pairMode: 'pair',
      activity: 'playing',
      settingVibe: 'living-room',
    },
  },
  {
    id: 'persian-groom',
    label: 'Persian grooming',
    hints: 'persian cat grooming its long fur on a velvet cushion',
    portraitStyle: 'full-body',
    category: 'cat',
    presetOptions: { species: 'cat', coatStyle: 'long-fluffy', activity: 'grooming' },
  },
  {
    id: 'orange-tabby-yawn',
    label: 'Orange tabby yawn',
    hints: 'orange tabby cat stretching and yawning on a rug',
    portraitStyle: 'full-body',
    category: 'cat',
    presetOptions: {
      species: 'cat',
      coatStyle: 'striped',
      activity: 'resting',
      expression: 'sleepy',
    },
  },
  {
    id: 'parrot-perch',
    label: 'Macaw on perch',
    hints: 'colorful macaw parrot on a wooden perch with ruffled feathers',
    portraitStyle: 'portrait',
    category: 'bird',
    presetOptions: { species: 'bird', activity: 'perched', expression: 'regal' },
  },
  {
    id: 'cockatiel-crest',
    label: 'Cockatiel crest',
    hints: 'cockatiel with raised crest feathers and cheek spots',
    portraitStyle: 'portrait',
    category: 'bird',
    presetOptions: { species: 'bird', expression: 'curious', cameraAngle: 'close-up-macro' },
  },
  {
    id: 'budgie-flight',
    label: 'Budgie in flight',
    hints: 'green budgerigar with wings spread mid-flight',
    portraitStyle: 'action',
    category: 'bird',
    presetOptions: { species: 'bird', activity: 'jumping', cameraAngle: 'low-angle' },
  },
  {
    id: 'african-grey-portrait',
    label: 'African grey portrait',
    hints: 'african grey parrot with intelligent eye and detailed feather texture',
    portraitStyle: 'portrait',
    category: 'bird',
    presetOptions: { species: 'bird', expression: 'alert', lightingStyle: 'soft-window' },
  },
  {
    id: 'canary-cage',
    label: 'Canary on branch',
    hints: 'bright yellow canary perched on a small branch',
    portraitStyle: 'full-body',
    category: 'bird',
    presetOptions: { species: 'bird', activity: 'perched', settingVibe: 'living-room' },
  },
  {
    id: 'rabbit-garden',
    label: 'Rabbit in garden',
    hints: 'holland lop rabbit nibbling clover in a cottage garden',
    portraitStyle: 'full-body',
    category: 'rabbit',
    presetOptions: { species: 'rabbit', activity: 'nibbling', settingVibe: 'garden' },
  },
  {
    id: 'white-rabbit-snow',
    label: 'White rabbit snow',
    hints: 'white angora rabbit sitting in soft snow',
    portraitStyle: 'full-body',
    category: 'rabbit',
    presetOptions: { species: 'rabbit', coatStyle: 'long-fluffy', settingVibe: 'snow-yard' },
  },
  {
    id: 'bunny-basket',
    label: 'Bunny in basket',
    hints: 'brown lop-eared bunny in a wicker basket with hay',
    portraitStyle: 'portrait',
    category: 'rabbit',
    presetOptions: { species: 'rabbit', ageStage: 'baby', activity: 'cuddling' },
  },
  {
    id: 'two-rabbits-garden',
    label: 'Two rabbits',
    hints: 'two rabbits exploring a flower garden path',
    portraitStyle: 'full-body',
    pair: true,
    category: 'rabbit',
    presetOptions: {
      species: 'rabbit',
      pairMode: 'pair',
      activity: 'exploring',
      settingVibe: 'garden',
    },
  },
  {
    id: 'guinea-pig-veggies',
    label: 'Guinea pig veggies',
    hints: 'guinea pig nibbling fresh vegetables on a kitchen mat',
    portraitStyle: 'full-body',
    category: 'small',
    presetOptions: { species: 'small-pet', activity: 'nibbling', settingVibe: 'living-room' },
  },
  {
    id: 'ferret-tunnel',
    label: 'Ferret tunnel',
    hints: 'ferret peeking out of a play tunnel with bright eyes',
    portraitStyle: 'portrait',
    category: 'small',
    presetOptions: { species: 'small-pet', expression: 'mischievous', activity: 'exploring' },
  },
  {
    id: 'hedgehog-hands',
    label: 'Hedgehog close-up',
    hints: 'hedgehog with tiny quills and button nose on a soft blanket',
    portraitStyle: 'portrait',
    category: 'small',
    presetOptions: { species: 'small-pet', cameraAngle: 'close-up-macro', activity: 'resting' },
  },
  {
    id: 'hamster-cheeks',
    label: 'Hamster cheeks',
    hints: 'syrian hamster with stuffed cheek pouches beside seed mix',
    portraitStyle: 'portrait',
    category: 'small',
    presetOptions: { species: 'small-pet', activity: 'nibbling', expression: 'playful' },
  },
];

export function getPetPreset(id: string): PetPreset | undefined {
  return PET_PRESETS.find(preset => preset.id === id);
}

export function petPresetsForCategory(category: PetPresetCategory | 'all' = 'all'): PetPreset[] {
  if (category === 'all') {
    return [...PET_PRESETS];
  }

  return PET_PRESETS.filter(preset => preset.category === category);
}
