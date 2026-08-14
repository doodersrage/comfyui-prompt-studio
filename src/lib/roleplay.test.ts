import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendRoleplayStoryBeat,
  extractJsonValue,
  mergeRoleplayStoryStills,
  normalizeRoleplayTone,
  parseRoleplayBio,
  parseRoleplayScenes,
  patchRoleplayStoryBeat,
  resolveRoleplayPersonaPrompt,
  roleplayIntroScene,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_INTRO_SCENE_ID,
  templateRoleplayBio,
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

  it('normalizes tone and custom persona prompts', () => {
    assert.equal(normalizeRoleplayTone('CHAOTIC'), 'chaotic');
    assert.equal(normalizeRoleplayTone('nope'), 'silly');
    assert.match(resolveRoleplayPersonaPrompt('hoodie-dragon'), /dragon/i);
    assert.equal(resolveRoleplayPersonaPrompt('custom', ' a sentient lamp '), 'a sentient lamp');
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

  it('keeps unique starter parts and includes the new cast', () => {
    const ids = ROLEPLAY_ARCHETYPES.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 24);
    assert.ok(ids.includes('subway-mermaid'));
    assert.ok(ids.includes('lava-lamp'));
    assert.equal(resolveRoleplayPersonaPrompt('moon-intern').length > 0, true);
  });
});
