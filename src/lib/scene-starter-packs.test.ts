import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { UserSceneStarterPreset } from './user-scene-starter-presets';
import { buildSceneStarterPack, parseSceneStarterPack } from './scene-starter-packs';

function preset(overrides: Partial<UserSceneStarterPreset> = {}): UserSceneStarterPreset {
  return {
    id: 'p1',
    label: 'A Preset',
    hints: 'a scene',
    category: 'sport',
    ...overrides,
  } as UserSceneStarterPreset;
}

describe('buildSceneStarterPack', () => {
  it('sets version 1, trims name, and stamps exportedAt as an ISO string', () => {
    const pack = buildSceneStarterPack({ name: '  My Pack  ', presets: [preset()] });
    assert.equal(pack.version, 1);
    assert.equal(pack.name, 'My Pack');
    assert.ok(!Number.isNaN(Date.parse(pack.exportedAt)));
    assert.equal(pack.presets.length, 1);
  });

  it('trims description, dropping it to undefined when blank', () => {
    const withDesc = buildSceneStarterPack({ name: 'x', description: '  a note  ', presets: [] });
    assert.equal(withDesc.description, 'a note');
    const blank = buildSceneStarterPack({ name: 'x', description: '   ', presets: [] });
    assert.equal(blank.description, undefined);
  });
});

describe('parseSceneStarterPack', () => {
  it('parses a valid pack JSON string', () => {
    const pack = buildSceneStarterPack({ name: 'x', presets: [preset()] });
    const parsed = parseSceneStarterPack(JSON.stringify(pack));
    // JSON.stringify drops the description key entirely when it's undefined,
    // so the round-tripped object omits it rather than carrying it as
    // `undefined` -- compare against the same JSON round trip.
    assert.deepEqual(parsed, JSON.parse(JSON.stringify(pack)));
  });

  it('throws for a wrong version', () => {
    assert.throws(
      () => parseSceneStarterPack(JSON.stringify({ version: 2, name: 'x', presets: [] })),
      /Invalid scene starter pack file/
    );
  });

  it('throws for a missing/blank name', () => {
    assert.throws(
      () => parseSceneStarterPack(JSON.stringify({ version: 1, name: '  ', presets: [] })),
      /Invalid scene starter pack file/
    );
  });

  it('throws when presets is not an array', () => {
    assert.throws(
      () => parseSceneStarterPack(JSON.stringify({ version: 1, name: 'x', presets: 'nope' })),
      /Invalid scene starter pack file/
    );
  });

  it('throws for malformed JSON', () => {
    assert.throws(() => parseSceneStarterPack('{not json'));
  });
});

describe('downloadSceneStarterPack', async () => {
  const { downloadSceneStarterPack } = await import('./scene-starter-packs');

  const createObjectURL = mock.fn(() => 'blob:mock-url');
  const revokeObjectURL = mock.fn((_url: string) => {});
  const click = mock.fn(() => {});

  afterEach(() => {
    createObjectURL.mock.resetCalls();
    revokeObjectURL.mock.resetCalls();
    click.mock.resetCalls();
    delete (globalThis as { document?: unknown }).document;
  });

  function installDom(): { hrefs: string[]; downloads: string[] } {
    const hrefs: string[] = [];
    const downloads: string[] = [];
    const RealURL = URL;
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: Object.assign(RealURL, { createObjectURL, revokeObjectURL }),
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: (tag: string) => {
          assert.equal(tag, 'a');
          const anchor = {
            set href(value: string) {
              hrefs.push(value);
            },
            set download(value: string) {
              downloads.push(value);
            },
            click,
          };
          return anchor;
        },
      },
    });
    return { hrefs, downloads };
  }

  it('creates a blob url, sets anchor href/download, clicks, and revokes the url', () => {
    const { hrefs, downloads } = installDom();
    const pack = buildSceneStarterPack({ name: 'My Cool Pack', presets: [] });
    downloadSceneStarterPack(pack);
    assert.equal(createObjectURL.mock.calls.length, 1);
    assert.deepEqual(hrefs, ['blob:mock-url']);
    assert.deepEqual(downloads, ['scene-starter-pack-My-Cool-Pack.json']);
    assert.equal(click.mock.calls.length, 1);
    assert.deepEqual(revokeObjectURL.mock.calls[0]!.arguments, ['blob:mock-url']);
  });

  it('truncates a long pack name to 40 characters in the filename', () => {
    const { downloads } = installDom();
    const pack = buildSceneStarterPack({ name: 'x'.repeat(80), presets: [] });
    downloadSceneStarterPack(pack);
    assert.equal(downloads[0], `scene-starter-pack-${'x'.repeat(40)}.json`);
  });
});
