import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendRoleplayStoryBeat,
  continueRoleplayScenes,
  extractJsonValue,
  filterFreshRoleplayScenes,
  formatRoleplayAvoidedScenes,
  formatRoleplayStoryDigest,
  mergeRoleplaySceneOptions,
  mergeRoleplayStoryStills,
  normalizeRoleplayTone,
  normalizeRoleplayContent,
  parseRoleplayAllowGore,
  applyRoleplayCharacterName,
  MAX_ROLEPLAY_CHARACTER_NAME,
  normalizeRoleplayCharacterName,
  parseRoleplayBio,
  parseRoleplayBioFromText,
  isRoleplayBioComplete,
  parseRoleplayScenes,
  patchRoleplayStoryBeat,
  resolveRoleplayPersonaPrompt,
  resolveRoleplayToneAndContent,
  ROLEPLAY_TONES,
  roleplayScenesTooSimilar,
  roleplayToneLine,
  roleplayToneTemperature,
  isRoleplayAdultContent,
  lastRoleplayPlotBeat,
  lastRoleplayStillImage,
  lastCompletedRoleplayStillUrl,
  MAX_ROLEPLAY_STILL_TAKES,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  resolveRoleplaySetting,
  formatRoleplaySettingCue,
  formatRoleplayWardrobeCue,
  rollRoleplaySetting,
  ROLEPLAY_SETTING_PRESETS,
  roleplayIntroScene,
  roleplayStillBasename,
  roleplayStillTakes,
  roleplayStoryPromptIds,
  beginRoleplayStillRetryPatch,
  canRetryRoleplayStill,
  roleplayStillQueueResultPatch,
  selectRoleplayStillTakePatch,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_INTRO_SCENE_ID,
  formatRoleplayStoryMarkdown,
  slugRoleplayExportPart,
  templateRoleplayBio,
  templateRoleplayScenes,
} from './roleplay';

describe('roleplay parsers', () => {
  it('reads fenced JSON bios and fills required fields', () => {
    const parsed = parseRoleplayBio(
      extractJsonValue(`Here you go
\`\`\`json
{ "name": "Crisp", "look": "a toaster with a scarf", "personality": "sincere", "catchphrase": "heat!" }
\`\`\``)
    );
    assert.equal(parsed.name, 'Crisp');
    assert.equal(parsed.look, 'a toaster with a scarf');
    assert.equal(parsed.catchphrase, 'heat!');
  });

  it('falls back when JSON is junk', () => {
    const fallback = templateRoleplayBio('sentient-toaster');
    const parsed = parseRoleplayBio(extractJsonValue('not json'), fallback);
    assert.equal(parsed.name, fallback.name);
  });

  it('locks a player-assigned character name on bios', () => {
    assert.equal(normalizeRoleplayCharacterName('  Alex   Quill  '), 'Alex Quill');
    assert.equal(normalizeRoleplayCharacterName('x'.repeat(80)).length, MAX_ROLEPLAY_CHARACTER_NAME);
    const named = applyRoleplayCharacterName(templateRoleplayBio('raccoon-pirate'), 'Alex Quill');
    assert.equal(named.name, 'Alex Quill');
    assert.equal(named.look, templateRoleplayBio('raccoon-pirate').look);
    const parsed = parseRoleplayBio(
      { name: 'Captain Nib', look: 'a raccoon in a hat', personality: 'bold' },
      undefined,
      'Alex Quill'
    );
    assert.equal(parsed.name, 'Alex Quill');
    assert.equal(templateRoleplayBio('raccoon-pirate', undefined, 'Mara').name, 'Mara');
    assert.equal(applyRoleplayCharacterName(named, '').name, 'Alex Quill');
  });

  it('parses a labeled or unlabeled character bible', () => {
    const labeled = parseRoleplayBioFromText(
      'Name: Mara Quill\nLook: ink-stained coat, gold-rim glasses\nPersonality: dry, loyal, always late\nCatchphrase: notes first'
    );
    assert.ok(labeled);
    assert.equal(labeled.name, 'Mara Quill');
    assert.equal(labeled.look, 'ink-stained coat, gold-rim glasses');
    assert.equal(labeled.personality, 'dry, loyal, always late');
    assert.equal(labeled.catchphrase, 'notes first');
    assert.equal(isRoleplayBioComplete(labeled), true);

    const paragraphs = parseRoleplayBioFromText(
      'Alex Quill\na raccoon in a rain coat\ndry and loyal, keeps the receipts',
      'Ignored'
    );
    assert.ok(paragraphs);
    assert.equal(paragraphs.name, 'Alex Quill');
    assert.equal(paragraphs.look, 'a raccoon in a rain coat');
    assert.match(paragraphs.personality, /dry and loyal/);

    assert.equal(parseRoleplayBioFromText('just a name'), null);
    assert.equal(isRoleplayBioComplete({ name: 'Mara', look: 'a coat' }), false);
  });

  it('reads scene arrays from a wrapper object', () => {
    const scenes = parseRoleplayScenes(
      extractJsonValue(
        '{ "scenes": [{ "title": "Airport security", "blurb": "Empty your crumbs." }, "Open mic"] }'
      )
    );
    assert.equal(scenes.length, 2);
    assert.equal(scenes[0]?.title, 'Airport security');
    assert.equal(scenes[1]?.title, 'Open mic');
  });

  it('normalizes tone, content rating, and custom persona prompts', () => {
    assert.equal(normalizeRoleplayTone('CHAOTIC'), 'chaotic');
    assert.equal(normalizeRoleplayTone('noir'), 'noir');
    assert.equal(normalizeRoleplayTone('MELANCHOLY'), 'melancholy');
    assert.equal(normalizeRoleplayTone('sultry'), 'silly');
    assert.equal(normalizeRoleplayTone('nope'), 'silly');
    assert.equal(ROLEPLAY_TONES.length, 12);
    assert.match(roleplayToneLine('horror'), /dread/i);
    assert.equal(roleplayToneTemperature('cozy'), 0.7);
    assert.equal(roleplayToneTemperature('chaotic'), 0.95);
    assert.equal(normalizeRoleplayContent('SFW'), 'clean');
    assert.equal(normalizeRoleplayContent('suggestive'), 'suggestive');
    assert.equal(normalizeRoleplayContent('explicit'), 'explicit');
    assert.equal(normalizeRoleplayContent(''), 'pg13');
    assert.deepEqual(resolveRoleplayToneAndContent('sultry'), {
      tone: 'silly',
      content: 'sultry',
    });
    assert.deepEqual(resolveRoleplayToneAndContent('nsfw'), {
      tone: 'silly',
      content: 'explicit',
    });
    assert.deepEqual(resolveRoleplayToneAndContent('cinematic', 'raunchy'), {
      tone: 'cinematic',
      content: 'raunchy',
    });
    assert.equal(normalizeRoleplayPlayAs('photo'), 'photo');
    assert.equal(normalizeRoleplayPlayAs('img2img'), 'photo');
    assert.equal(normalizeRoleplayPlayAs(''), 'text');
    assert.equal(isRoleplayAdultContent('sultry'), true);
    assert.equal(isRoleplayAdultContent('pg13'), false);
    assert.equal(parseRoleplayAllowGore(true), true);
    assert.equal(parseRoleplayAllowGore('true'), true);
    assert.equal(parseRoleplayAllowGore(false), false);
    assert.match(resolveRoleplayPersonaPrompt('hoodie-dragon'), /dragon/i);
    assert.equal(resolveRoleplayPersonaPrompt('custom', ' a sentient lamp '), 'a sentient lamp');
  });

  it('resolves a seeded setting and writes replace-scene cues for From photo', () => {
    assert.equal(resolveRoleplaySetting('  neon alley  ', 'studio lock'), 'neon alley');
    assert.equal(resolveRoleplaySetting('', 'locked tavern'), 'locked tavern');
    assert.equal(resolveRoleplaySetting('', ''), '');
    assert.ok(ROLEPLAY_SETTING_PRESETS.length >= 4);
    const rolled = rollRoleplaySetting();
    assert.ok(ROLEPLAY_SETTING_PRESETS.some(entry => entry.setting === rolled));
    assert.match(
      formatRoleplaySettingCue({
        setting: 'flooded cathedral',
        hasReferenceImage: true,
        phase: 'prompt',
      }),
      /Replace the scene with flooded cathedral/i
    );
    assert.match(
      formatRoleplaySettingCue({
        setting: 'flooded cathedral',
        hasReferenceImage: true,
        phase: 'bio',
      }),
      /not the photo's background/i
    );
    assert.match(
      formatRoleplaySettingCue({
        setting: 'tavern',
        phase: 'scenes',
      }),
      /opening options happen in or around this place/i
    );
    assert.match(
      formatRoleplaySettingCue({
        hasReferenceImage: true,
        isolatedSubject: true,
        setting: 'neon alley',
        phase: 'prompt',
      }),
      /isolated on a blank white backdrop/i
    );
    assert.match(
      formatRoleplaySettingCue({
        hasReferenceImage: true,
        isolatedSubject: true,
        phase: 'prompt',
      }),
      /Do not keep the white background/i
    );
    assert.match(
      formatRoleplaySettingCue({
        hasReferenceImage: true,
        isolatedSubject: true,
        setting: 'neon alley',
        phase: 'prompt',
      }),
      /Replace the photo's clothing/i
    );
    assert.match(
      formatRoleplayWardrobeCue({
        hasReferenceImage: true,
        phase: 'prompt',
      }),
      /beat's clothes win/i
    );
    assert.match(
      formatRoleplayWardrobeCue({
        hasReferenceImage: true,
        phase: 'bio',
      }),
      /not the photo/i
    );
    assert.equal(formatRoleplayWardrobeCue({ phase: 'prompt' }), '');
    assert.equal(normalizeRoleplayIsolateSubject(undefined), true);
    assert.equal(normalizeRoleplayIsolateSubject(false), false);
  });

  it('caps story beats', () => {
    let story = appendRoleplayStoryBeat([], { id: 'a', title: 'A', blurb: 'a' });
    for (let index = 0; index < 20; index += 1) {
      story = appendRoleplayStoryBeat(story, {
        id: `s${index}`,
        title: `Beat ${index}`,
        blurb: 'x',
      });
    }
    assert.equal(story.length, 12);
    assert.equal(story[0]?.title, 'Beat 8');
  });

  it('builds an establishing first-look still from the bio', () => {
    const intro = roleplayIntroScene({
      name: 'Crisp',
      look: 'a toaster with a scarf',
      personality: 'sincere',
    });
    assert.equal(intro.id, ROLEPLAY_INTRO_SCENE_ID);
    assert.equal(intro.title, 'First look');
    assert.match(intro.blurb, /Crisp/);
    assert.match(intro.blurb, /toaster with a scarf/);
    const still = lastRoleplayStillImage([
      { ...intro, at: 1, stillStatus: 'queued' },
      {
        id: 'dock',
        title: 'Foggy dock',
        blurb: 'Tide in.',
        at: 2,
        imageUrl: '/view/dock.png',
        stillStatus: 'completed',
      },
    ]);
    assert.equal(still?.url, '/view/dock.png');
    assert.equal(still?.title, 'Foggy dock');
    assert.equal(lastRoleplayStillImage([{ ...intro, at: 1 }]), null);
  });

  it('rolls later options from the last chosen beat instead of the starter vignettes', () => {
    const opening = templateRoleplayScenes('raccoon-pirate');
    assert.equal(opening[0]?.title, 'Mutiny at brunch');

    const intro = roleplayIntroScene(templateRoleplayBio('raccoon-pirate'));
    const afterIntro = templateRoleplayScenes('raccoon-pirate', undefined, [
      { ...intro, at: 1 },
    ]);
    assert.equal(afterIntro[0]?.title, 'Mutiny at brunch');

    const chosen = {
      id: 'mutiny-at-brunch-1',
      title: 'Mutiny at brunch',
      blurb: 'The crew wants pancakes. You want the map. The syrup is a hostage.',
      at: 2,
    };
    const story = [
      { ...intro, at: 1 },
      chosen,
    ];
    assert.equal(lastRoleplayPlotBeat(story)?.title, 'Mutiny at brunch');

    const next = templateRoleplayScenes('raccoon-pirate', undefined, story, 'Captain Nib');
    assert.equal(next.length, 4);
    assert.ok(next.every(scene => scene.title !== 'Mutiny at brunch'));
    assert.ok(next.every(scene => scene.title !== 'Foggy dock heist'));
    assert.equal(new Set(next.map(scene => scene.title)).size, 4);
    assert.ok(next.some(scene => /mutiny|brunch/i.test(`${scene.title} ${scene.blurb}`)));
    assert.ok(next.every(scene => /Captain Nib|brunch|mutiny|pancakes|syrup|map/i.test(scene.blurb)));
    assert.ok(
      next.some(scene => /room|later|guest|wardrobe|night|opposite|public|stunt/i.test(scene.title))
    );

    const digest = formatRoleplayStoryDigest(story);
    assert.match(digest, /Last chosen beat/);
    assert.match(digest, /Mutiny at brunch/);
    assert.match(digest, /continue from here/i);
    assert.match(digest, /different photographs/i);
    assert.match(digest, /Already offered or played/);

    const openingDigest = formatRoleplayStoryDigest([{ ...intro, at: 1 }]);
    assert.match(openingDigest, /opening plot options/i);
    assert.doesNotMatch(openingDigest, /Last chosen beat/);
  });

  it('drops already-played titles and fills from continuations', () => {
    const story = [
      {
        id: 'mutiny-at-brunch-1',
        title: 'Mutiny at brunch',
        blurb: 'The syrup is a hostage.',
        at: 1,
      },
    ];
    const fresh = filterFreshRoleplayScenes(
      [
        { id: 'dup', title: 'Mutiny at brunch', blurb: 'again' },
        { id: 'new', title: 'Syrup tribunal', blurb: 'The crew holds court.' },
      ],
      story
    );
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0]?.title, 'Syrup tribunal');

    const merged = mergeRoleplaySceneOptions(
      [{ id: 'dup', title: 'Mutiny at brunch', blurb: 'again' }],
      continueRoleplayScenes(story[0]!, story, 'Captain Nib'),
      story
    );
    assert.equal(merged.length, 4);
    assert.ok(merged.every(scene => scene.title.toLowerCase() !== 'mutiny at brunch'));
  });

  it('drops near-duplicate titles and rejected reroll options', () => {
    assert.equal(
      roleplayScenesTooSimilar(
        { title: 'Mutiny at brunch', blurb: 'The syrup is a hostage.' },
        { title: 'Right after Mutiny at brunch', blurb: 'Same syrup, same table.' }
      ),
      true
    );
    assert.equal(
      roleplayScenesTooSimilar(
        { title: 'Syrup tribunal', blurb: 'The crew holds court.' },
        { title: 'Night shift', blurb: 'Light flips after mutiny at brunch.' }
      ),
      false
    );

    const story = [
      {
        id: 'mutiny-at-brunch-1',
        title: 'Mutiny at brunch',
        blurb: 'The syrup is a hostage.',
        at: 1,
      },
    ];
    const fresh = filterFreshRoleplayScenes(
      [
        { id: 'echo', title: 'Right after Mutiny at brunch', blurb: 'Still at the table.' },
        { id: 'dup-blurb', title: 'Pancake standoff', blurb: 'The syrup is a hostage.' },
        { id: 'new', title: 'Syrup tribunal', blurb: 'The crew holds court on the roof.' },
      ],
      story
    );
    assert.equal(fresh.some(scene => scene.title === 'Syrup tribunal'), true);
    assert.equal(fresh.some(scene => /mutiny at brunch/i.test(scene.title)), false);

    const rejected = [{ id: 'old', title: 'Syrup tribunal', blurb: 'The crew holds court on the roof.' }];
    const reroll = mergeRoleplaySceneOptions(
      [{ id: 'again', title: 'Syrup tribunal', blurb: 'Court, but louder.' }],
      continueRoleplayScenes(story[0]!, story, 'Captain Nib', rejected),
      story,
      4,
      rejected
    );
    assert.ok(reroll.every(scene => scene.title.toLowerCase() !== 'syrup tribunal'));
    assert.match(formatRoleplayAvoidedScenes(rejected), /Syrup tribunal/);
  });

  it('patches a beat and hydrates stills from gallery jobs', () => {
    const story = appendRoleplayStoryBeat([], { id: 'intro', title: 'First look', blurb: 'hi' }, {
      stillStatus: 'writing',
    });
    const beat = story[0];
    assert.ok(beat);
    const patched = patchRoleplayStoryBeat(story, beat, {
      prompt: 'a raccoon',
      promptId: 'job-1',
      stillStatus: 'queued',
    });
    assert.equal(patched[0]?.promptId, 'job-1');
    const merged = mergeRoleplayStoryStills(patched, [
      { promptId: 'job-1', status: 'pending', imageUrl: null },
    ]);
    assert.equal(merged.changed, false);
    const done = mergeRoleplayStoryStills(patched, [
      { promptId: 'job-1', status: 'completed', imageUrl: '/view/1.png' },
    ]);
    assert.equal(done.changed, true);
    assert.equal(done.story[0]?.stillStatus, 'completed');
    assert.equal(done.story[0]?.imageUrl, '/view/1.png');
  });

  it('archives completed stills on retry and hydrates every take from the gallery', () => {
    const beat = {
      id: 'intro',
      title: 'First look',
      blurb: 'hi',
      at: 1,
      prompt: 'a raccoon',
      promptId: 'job-1',
      imageUrl: '/view/1.png',
      stillStatus: 'completed' as const,
    };
    assert.equal(canRetryRoleplayStill(beat), true);
    assert.equal(canRetryRoleplayStill({ ...beat, prompt: undefined }), false);

    const retrying = { ...beat, ...beginRoleplayStillRetryPatch(beat) };
    assert.equal(retrying.stillTakes?.length, 2);
    assert.equal(retrying.stillTakes?.[0]?.imageUrl, '/view/1.png');
    assert.equal(retrying.promptId, undefined);
    assert.equal(retrying.stillStatus, 'writing');
    assert.equal(canRetryRoleplayStill(retrying), false);
    assert.equal(lastCompletedRoleplayStillUrl(retrying), '/view/1.png');
    assert.equal(lastRoleplayStillImage([retrying])?.url, '/view/1.png');

    const queued = { ...retrying, ...roleplayStillQueueResultPatch(retrying, 'job-2') };
    assert.equal(queued.promptId, 'job-2');
    assert.equal(queued.stillStatus, 'queued');
    assert.deepEqual(roleplayStoryPromptIds([queued]), ['job-1', 'job-2']);

    const done = mergeRoleplayStoryStills([queued], [
      { promptId: 'job-1', status: 'completed', imageUrl: '/view/1.png' },
      { promptId: 'job-2', status: 'completed', imageUrl: '/view/2.png' },
    ]);
    assert.equal(done.changed, true);
    assert.equal(done.story[0]?.imageUrl, '/view/2.png');
    assert.equal(done.story[0]?.stillTakes?.[0]?.imageUrl, '/view/1.png');
    assert.equal(done.story[0]?.stillTakes?.[1]?.imageUrl, '/view/2.png');

    const selected = {
      ...done.story[0]!,
      ...selectRoleplayStillTakePatch(done.story[0]!, 0),
    };
    assert.equal(selected.imageUrl, '/view/1.png');
    assert.equal(selected.stillTakeIndex, 0);
    assert.equal(selected.promptId, 'job-1');

    const later = mergeRoleplayStoryStills([selected], [
      { promptId: 'job-2', status: 'completed', imageUrl: '/view/2b.png' },
    ]);
    assert.equal(later.story[0]?.imageUrl, '/view/1.png');
    assert.equal(later.story[0]?.stillTakeIndex, 0);
    assert.equal(later.story[0]?.stillTakes?.[1]?.imageUrl, '/view/2b.png');
  });

  it('caps archived still takes when retrying', () => {
    const stillTakes = Array.from({ length: MAX_ROLEPLAY_STILL_TAKES }, (_, index) => ({
      promptId: `job-${index}`,
      imageUrl: `/view/${index}.png`,
      stillStatus: 'completed' as const,
    }));
    const beat = {
      id: 'intro',
      title: 'First look',
      blurb: 'hi',
      at: 1,
      prompt: 'a raccoon',
      promptId: 'job-7',
      imageUrl: '/view/7.png',
      stillStatus: 'completed' as const,
      stillTakes,
      stillTakeIndex: 7,
    };
    assert.equal(roleplayStillTakes(beat).length, MAX_ROLEPLAY_STILL_TAKES);
    const retrying = beginRoleplayStillRetryPatch(beat);
    assert.equal(retrying.stillTakes?.length, MAX_ROLEPLAY_STILL_TAKES);
    assert.equal(retrying.stillTakes?.[0]?.promptId, 'job-1');
    assert.equal(retrying.stillTakes?.at(-1)?.stillStatus, 'writing');
  });

  it('keeps unique starter parts and includes the new cast', () => {
    const ids = ROLEPLAY_ARCHETYPES.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 24);
    assert.ok(ids.includes('subway-mermaid'));
    assert.ok(ids.includes('lava-lamp'));
    assert.equal(resolveRoleplayPersonaPrompt('moon-intern').length > 0, true);
  });

  it('formats a downloadable story markdown with still filenames', () => {
    assert.equal(slugRoleplayExportPart('First look!'), 'first-look');
    assert.equal(roleplayStillBasename('First look', 0), '01-first-look');
    const markdown = formatRoleplayStoryMarkdown({
      bio: {
        name: 'Crisp',
        look: 'a toaster with a scarf',
        personality: 'sincere',
        catchphrase: 'heat!',
      },
      tone: 'Silly',
      content: 'PG-13',
      personaLabel: 'Sentient toaster',
      story: [
        { id: 'intro', title: 'First look', blurb: 'Hello crumbs.', at: 1, prompt: 'a toaster' },
      ],
      stillFilenames: ['01-first-look.png'],
    });
    assert.match(markdown, /^# Crisp/m);
    assert.match(markdown, /Part: Sentient toaster/);
    assert.match(markdown, /Content: PG-13/);
    assert.match(markdown, /Still: `stills\/01-first-look.png`/);
    assert.match(markdown, /a toaster/);
  });
});
