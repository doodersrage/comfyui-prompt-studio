import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetBrowserStorageCache } from './browser-storage';
import {
  applyRoleplayLibrarySession,
  deleteRoleplayLibrarySession,
  loadRoleplayLibrary,
  persistRoleplayLibraryFromCache,
  ROLEPLAY_LIBRARY_KEY,
  roleplaySessionHasProgress,
  roleplaySessionTitle,
  saveRoleplayLibrary,
  startNewRoleplaySession,
  upsertRoleplayLibrarySession,
} from './roleplay-library';
import type { RoleplayToolCache } from './settings-cache';

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
}

function sampleCache(patch: Partial<RoleplayToolCache> = {}): RoleplayToolCache {
  return {
    personaId: 'raccoon-pirate',
    characterName: 'Alex Quill',
    tone: 'noir',
    content: 'pg13',
    bio: {
      name: 'Alex Quill',
      look: 'a raccoon in a rain coat',
      personality: 'dry and loyal',
    },
    story: [
      {
        id: 'intro-first-look',
        title: 'First look',
        blurb: 'Portrait.',
        at: 1,
      },
      {
        id: 'mutiny',
        title: 'Mutiny at brunch',
        blurb: 'Syrup hostage.',
        at: 2,
        imageUrl: '/api/gallery/media/1?variant=original',
        stillStatus: 'completed',
      },
    ],
    ...patch,
  };
}

describe('roleplay library', () => {
  beforeEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      window.localStorage.removeItem(ROLEPLAY_LIBRARY_KEY);
    });
  });

  afterEach(() => {
    withMockLocalStorage(() => {
      resetBrowserStorageCache();
      window.localStorage.removeItem(ROLEPLAY_LIBRARY_KEY);
    });
  });

  it('ignores empty drafts and titles from the assigned name', () => {
    assert.equal(roleplaySessionHasProgress({ personaId: 'raccoon-pirate' }), false);
    assert.equal(roleplaySessionTitle(sampleCache()), 'Alex Quill');
  });

  it('archives a session, continues it, and deletes it', () => {
    withMockLocalStorage(() => {
      const first = persistRoleplayLibraryFromCache(sampleCache());
      assert.ok(first);
      assert.equal(first.session.title, 'Alex Quill');
      assert.equal(first.session.beatCount, 1);
      assert.equal(first.cache.activeSessionId, first.session.id);
      assert.equal(loadRoleplayLibrary().length, 1);

      const continued = applyRoleplayLibrarySession(first.session);
      assert.equal(continued.bio?.name, 'Alex Quill');
      assert.equal(continued.story?.[1]?.title, 'Mutiny at brunch');
      assert.equal(continued.activeSessionId, first.session.id);

      persistRoleplayLibraryFromCache({
        ...sampleCache({ characterName: 'Mara', bio: { name: 'Mara', look: 'a clerk', personality: 'tired' } }),
        activeSessionId: undefined,
      });
      assert.equal(loadRoleplayLibrary().length, 2);

      deleteRoleplayLibrarySession(first.session.id);
      const remaining = loadRoleplayLibrary();
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0]?.title, 'Mara');
    });
  });

  it('updates the same archive entry when the active session continues', () => {
    withMockLocalStorage(() => {
      const first = persistRoleplayLibraryFromCache(sampleCache());
      assert.ok(first);
      const next = persistRoleplayLibraryFromCache({
        ...first.cache,
        story: [
          ...(first.cache.story ?? []),
          { id: 'dock', title: 'Foggy dock', blurb: 'Tide in.', at: 3 },
        ],
      });
      assert.ok(next);
      assert.equal(next.session.id, first.session.id);
      assert.equal(loadRoleplayLibrary().length, 1);
      assert.equal(next.session.beatCount, 2);
    });
  });

  it('starts a new session without deleting the archive', () => {
    withMockLocalStorage(() => {
      const saved = persistRoleplayLibraryFromCache(
        sampleCache({
          referenceImageUrl: '/api/gallery/media/1?variant=original',
        })
      );
      assert.ok(saved);
      const blank = startNewRoleplaySession(saved.cache);
      assert.equal(blank.bio, undefined);
      assert.equal(blank.activeSessionId, undefined);
      assert.equal(blank.tone, saved.cache.tone);
      assert.equal(blank.characterName, 'Alex Quill');
      assert.equal(blank.referenceImageUrl, '/api/gallery/media/1?variant=original');
      assert.equal(loadRoleplayLibrary().length, 1);
    });
  });

  it('caps the library at 24 sessions', () => {
    withMockLocalStorage(() => {
      const sessions = Array.from({ length: 30 }, (_, index) => {
        const persisted = persistRoleplayLibraryFromCache(
          sampleCache({
            activeSessionId: undefined,
            characterName: `Cast ${index}`,
            bio: { name: `Cast ${index}`, look: 'a look', personality: 'game' },
          })
        );
        return persisted?.session;
      }).filter(Boolean);
      assert.equal(sessions.length, 30);
      assert.equal(loadRoleplayLibrary().length, 24);
      upsertRoleplayLibrarySession(sessions[0]!);
      saveRoleplayLibrary(loadRoleplayLibrary());
      assert.equal(loadRoleplayLibrary().length, 24);
    });
  });
});
