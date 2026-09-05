import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module('./browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

describe('collapsible-persist', async () => {
  const { loadCollapsibleOpen, saveCollapsibleOpen } = await import('./collapsible-persist');

  beforeEach(() => {
    stored = null;
    readBrowserValue.mock.resetCalls();
    writeBrowserValue.mock.resetCalls();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('loadCollapsibleOpen returns the fallback when there is no window (SSR)', () => {
    delete (globalThis as { window?: unknown }).window;
    assert.equal(loadCollapsibleOpen('panel-a', true), true);
    assert.equal(loadCollapsibleOpen('panel-a', false), false);
    assert.equal(readBrowserValue.mock.callCount(), 0);
  });

  it('loadCollapsibleOpen returns the fallback when nothing is stored for the id', () => {
    stored = { 'other-panel': false };
    assert.equal(loadCollapsibleOpen('panel-a', true), true);
  });

  it('loadCollapsibleOpen returns the stored boolean when present', () => {
    stored = { 'panel-a': false };
    assert.equal(loadCollapsibleOpen('panel-a', true), false);
  });

  it('loadCollapsibleOpen ignores non-object / non-boolean stored shapes', () => {
    stored = ['not-a-map'];
    assert.equal(loadCollapsibleOpen('panel-a', true), true);
    stored = { 'panel-a': 'yes' };
    assert.equal(loadCollapsibleOpen('panel-a', false), false);
  });

  it('saveCollapsibleOpen is a no-op without a window or with a blank id', () => {
    delete (globalThis as { window?: unknown }).window;
    saveCollapsibleOpen('panel-a', true);
    assert.equal(writeBrowserValue.mock.callCount(), 0);

    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    saveCollapsibleOpen('   ', true);
    assert.equal(writeBrowserValue.mock.callCount(), 0);
  });

  it('saveCollapsibleOpen merges into the existing map under the canonical key', () => {
    stored = { 'panel-a': false };
    saveCollapsibleOpen('  panel-b  ', true);
    assert.equal(writeBrowserValue.mock.callCount(), 1);
    const [key, value] = writeBrowserValue.mock.calls[0].arguments as [string, Record<string, boolean>];
    assert.equal(key, 'comfy-collapsible-open-v1');
    assert.deepEqual(value, { 'panel-a': false, 'panel-b': true });
    assert.equal(loadCollapsibleOpen('panel-b', false), true);
  });
});
