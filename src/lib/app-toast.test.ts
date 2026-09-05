import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let toastPreferenceEnabled = true;
const loadToastPreferenceEnabled = mock.fn(() => toastPreferenceEnabled);
const rememberToastPreference = mock.fn((_enabled: boolean) => {});
const pushSystemTrayMessage = mock.fn((input: Record<string, unknown>) => `tray-${String(input.text)}`);
mock.module('./system-tray-messages', {
  namedExports: { loadToastPreferenceEnabled, rememberToastPreference, pushSystemTrayMessage },
});

type FakeWindow = {
  dispatchEvent: (event: unknown) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  events: { type: string; detail: unknown }[];
  timers: { fn: () => void; ms: number }[];
};

function installWindow(): FakeWindow {
  const events: { type: string; detail: unknown }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const fakeWindow: FakeWindow = {
    events,
    timers,
    dispatchEvent: (event: unknown) => {
      const e = event as { type: string; detail: unknown };
      events.push({ type: e.type, detail: e.detail });
    },
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  return fakeWindow;
}

function uninstallWindow() {
  delete (globalThis as { window?: unknown }).window;
}

afterEach(() => {
  toastPreferenceEnabled = true;
  loadToastPreferenceEnabled.mock.resetCalls();
  rememberToastPreference.mock.resetCalls();
  pushSystemTrayMessage.mock.resetCalls();
  uninstallWindow();
});

describe('app-toast', async () => {
  const {
    APP_TOAST_EVENT,
    clearAppToasts,
    dismissAppToast,
    getAppToasts,
    pushAppToast,
    toastBulkQueueSummary,
    toastHeldMax,
    toastQueueOutcome,
  } = await import('./app-toast');

  // NOTE: `toasts` is module-level singleton state (not reset by re-importing
  // the module, since node:test's mock.module doesn't reset the module
  // registry between tests) -- clear it after every test so tests don't leak
  // toasts into one another. clearAppToasts() is safe to call without a
  // window installed (its internal emit() no-ops without one).
  afterEach(() => {
    clearAppToasts();
  });

  describe('pushAppToast / getAppToasts / dismissAppToast / clearAppToasts', () => {
    it('returns null without a window (SSR)', () => {
      assert.equal(pushAppToast({ text: 'hi' }), null);
    });

    it('returns null for a blank text even with a window', () => {
      installWindow();
      assert.equal(pushAppToast({ text: '   ' }), null);
    });

    it('returns null when the toast preference is disabled', () => {
      installWindow();
      toastPreferenceEnabled = false;
      assert.equal(pushAppToast({ text: 'hello' }), null);
    });

    it('pushes a toast, returns its id, and emits an app-toast event', () => {
      const win = installWindow();
      const id = pushAppToast({ text: 'Saved!' });
      assert.equal(typeof id, 'string');
      const toasts = getAppToasts();
      assert.equal(toasts.length, 1);
      assert.equal(toasts[0]!.text, 'Saved!');
      assert.equal(toasts[0]!.tone, 'neutral');
      assert.equal(toasts[0]!.id, id);
      assert.equal(win.events.length, 1);
      assert.equal(win.events[0]!.type, APP_TOAST_EVENT);
    });

    it('uses the given tone and href', () => {
      installWindow();
      pushAppToast({ text: 'Failed', tone: 'danger', href: '/queue' });
      const toasts = getAppToasts();
      assert.equal(toasts[0]!.tone, 'danger');
      assert.equal(toasts[0]!.href, '/queue');
    });

    it('keeps only the most recent MAX_VISIBLE (4) toasts, newest first', () => {
      installWindow();
      pushAppToast({ text: 'one' });
      pushAppToast({ text: 'two' });
      pushAppToast({ text: 'three' });
      pushAppToast({ text: 'four' });
      pushAppToast({ text: 'five' });
      const toasts = getAppToasts();
      assert.equal(toasts.length, 4);
      assert.deepEqual(
        toasts.map(t => t.text),
        ['five', 'four', 'three', 'two']
      );
    });

    it('schedules a dismiss timer using the default TTL when none is given', () => {
      const win = installWindow();
      pushAppToast({ text: 'auto-dismiss me' });
      assert.equal(win.timers.length, 1);
      assert.equal(win.timers[0]!.ms, 6500);
    });

    it('uses a custom ttlMs for the dismiss timer', () => {
      const win = installWindow();
      pushAppToast({ text: 'x', ttlMs: 1000 });
      assert.equal(win.timers[0]!.ms, 1000);
    });

    it('does not schedule a dismiss timer when ttlMs is 0', () => {
      const win = installWindow();
      pushAppToast({ text: 'sticky', ttlMs: 0 });
      assert.equal(win.timers.length, 0);
    });

    it('dismisses the toast when the scheduled timer fires', () => {
      const win = installWindow();
      pushAppToast({ text: 'temp' });
      assert.equal(getAppToasts().length, 1);
      win.timers[0]!.fn();
      assert.equal(getAppToasts().length, 0);
    });

    it('dismissAppToast removes a toast by id and emits an event', () => {
      const win = installWindow();
      const id = pushAppToast({ text: 'to remove' })!;
      const eventCountBefore = win.events.length;
      dismissAppToast(id);
      assert.equal(getAppToasts().length, 0);
      assert.ok(win.events.length > eventCountBefore);
    });

    it('dismissAppToast is a no-op (no extra emit) when the id is not found', () => {
      const win = installWindow();
      pushAppToast({ text: 'stays' });
      const eventCountBefore = win.events.length;
      dismissAppToast('nonexistent-id');
      assert.equal(getAppToasts().length, 1);
      assert.equal(win.events.length, eventCountBefore);
    });

    it('clearAppToasts empties the list and emits once', () => {
      const win = installWindow();
      pushAppToast({ text: 'a' });
      pushAppToast({ text: 'b' });
      const eventCountBefore = win.events.length;
      clearAppToasts();
      assert.equal(getAppToasts().length, 0);
      assert.equal(win.events.length, eventCountBefore + 1);
    });

    it('clearAppToasts is a no-op when there are no toasts', () => {
      installWindow();
      clearAppToasts();
      clearAppToasts();
      assert.equal(getAppToasts().length, 0);
    });

    it('getAppToasts returns a defensive copy', () => {
      installWindow();
      pushAppToast({ text: 'x' });
      const first = getAppToasts();
      first.pop();
      assert.equal(getAppToasts().length, 1);
    });
  });

  describe('toastQueueOutcome', () => {
    it('uses success tone, /gallery href, and a 5000ms ttl on success', () => {
      toastQueueOutcome({ ok: true, text: 'Queued 3 jobs' });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'success');
      assert.equal(call.href, '/gallery');
      assert.equal(call.ttlMs, 5000);
    });

    it('uses danger tone, /queue href, and a 9000ms ttl on failure', () => {
      toastQueueOutcome({ ok: false, text: 'Queue failed' });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'danger');
      assert.equal(call.href, '/queue');
      assert.equal(call.ttlMs, 9000);
    });

    it('uses the given href/ttlMs/actionLabel/actionEvent when provided', () => {
      toastQueueOutcome({
        ok: true,
        text: 'Done',
        href: '/custom',
        ttlMs: 1234,
        actionLabel: 'Undo',
        actionEvent: 'undo-event',
      });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.href, '/custom');
      assert.equal(call.ttlMs, 1234);
      assert.equal(call.actionLabel, 'Undo');
      assert.equal(call.actionEvent, 'undo-event');
    });
  });

  describe('toastHeldMax', () => {
    it('uses warning tone, /queue href, and a 14000ms ttl', () => {
      toastHeldMax({ text: 'Jobs held' });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'warning');
      assert.equal(call.href, '/queue');
      assert.equal(call.ttlMs, 14_000);
      assert.equal(call.text, 'Jobs held');
    });

    it('appends a count in parentheses when count > 1', () => {
      toastHeldMax({ text: 'Jobs held', count: 3 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.text, 'Jobs held (3)');
    });

    it('does not append a count when count is 1 or absent', () => {
      toastHeldMax({ text: 'Jobs held', count: 1 });
      assert.equal(
        (pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>).text,
        'Jobs held'
      );
    });
  });

  describe('toastBulkQueueSummary', () => {
    it('routes to a failure-toned outcome when there are failures', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 2, failed: 1 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'danger');
      assert.match(call.text as string, /Batch · 2 queued · 1 failed/);
    });

    it('routes to a warning-toned message when nothing was queued and nothing failed', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 0, failed: 0 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'warning');
      assert.equal(call.href, '/gallery');
    });

    it('routes to a success-toned outcome when items were queued with no failures', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 5, failed: 0 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.tone, 'success');
    });

    it('includes the skipped count in the text when given', () => {
      toastBulkQueueSummary({ label: 'Batch', queued: 3, failed: 0, skipped: 2 });
      const call = pushSystemTrayMessage.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(call.text, 'Batch · 3 queued · 2 skipped · 0 failed');
    });
  });
});
