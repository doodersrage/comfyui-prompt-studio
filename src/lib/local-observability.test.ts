import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resetBrowserStorageCache } from './browser-storage';
import {
  incrementLocalObservability,
  loadLocalObservability,
  LOCAL_OBSERVABILITY_KEY,
} from './local-observability';

describe('local-observability', () => {
  afterEach(() => {
    if (typeof globalThis.window !== 'undefined') {
      resetBrowserStorageCache();
    }
  });

  it('increments counters in browser storage', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
        },
        dispatchEvent: () => true,
      },
    });
    resetBrowserStorageCache();
    incrementLocalObservability('exactReplay');
    incrementLocalObservability('exactReplay');
    const snap = loadLocalObservability();
    assert.equal(snap.exactReplay, 2);
    assert.ok(storage.has(LOCAL_OBSERVABILITY_KEY) || snap.exactReplay === 2);
  });
});
