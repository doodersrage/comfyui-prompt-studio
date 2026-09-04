import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { noteJobCompletionEmail } from './job-completion-email';

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  mock.timers.reset();
});

describe('job-completion-email', () => {
  it('is a no-op when window is undefined (SSR guard)', () => {
    delete (globalThis as { window?: unknown }).window;
    const stub = installFetchStub(() => new Response('{}'));
    try {
      noteJobCompletionEmail({ promptId: 'p1', status: 'completed', prompt: 'hello' });
      mock.timers.tick(20000);
      assert.equal(stub.calls.length, 0);
    } finally {
      stub.restore();
    }
  });

  it('does not fetch immediately — only after the 8s debounce window', () => {
    const stub = installFetchStub(() => new Response('{}'));
    try {
      noteJobCompletionEmail({ promptId: 'p1', status: 'completed', prompt: 'hello' });
      assert.equal(stub.calls.length, 0);
      mock.timers.tick(7999);
      assert.equal(stub.calls.length, 0);
      mock.timers.tick(1);
      assert.equal(stub.calls.length, 1);
    } finally {
      stub.restore();
    }
  });

  it('posts the accumulated count, truncated last prompt, and last status', () => {
    const stub = installFetchStub(() => new Response('{}'));
    try {
      noteJobCompletionEmail({ promptId: 'p1', status: 'completed', prompt: 'a'.repeat(200) });
      noteJobCompletionEmail({ promptId: 'p2', status: 'error', prompt: 'short prompt' });
      mock.timers.tick(8000);
      assert.equal(stub.calls.length, 1);
      const body = JSON.parse(stub.calls[0]!.init?.body as string) as {
        completed: number;
        lastPrompt: string;
        lastStatus: string;
      };
      assert.equal(body.completed, 2);
      assert.equal(body.lastPrompt, 'short prompt');
      assert.equal(body.lastStatus, 'error');
      assert.equal(stub.calls[0]!.url, '/api/email/jobs-completed');
    } finally {
      stub.restore();
    }
  });

  it('truncates lastPrompt to 120 characters', () => {
    const stub = installFetchStub(() => new Response('{}'));
    try {
      noteJobCompletionEmail({ promptId: 'p1', status: 'completed', prompt: 'x'.repeat(200) });
      mock.timers.tick(8000);
      const body = JSON.parse(stub.calls[0]!.init?.body as string) as { lastPrompt: string };
      assert.equal(body.lastPrompt.length, 120);
    } finally {
      stub.restore();
    }
  });

  it('resets pendingCount to 0 after flushing, and restarts the debounce for the next call', () => {
    const stub = installFetchStub(() => new Response('{}'));
    try {
      noteJobCompletionEmail({ promptId: 'p1', status: 'completed', prompt: 'a' });
      mock.timers.tick(8000);
      assert.equal(stub.calls.length, 1);

      noteJobCompletionEmail({ promptId: 'p2', status: 'completed', prompt: 'b' });
      mock.timers.tick(7999);
      assert.equal(stub.calls.length, 1);
      mock.timers.tick(1);
      assert.equal(stub.calls.length, 2);
      const body = JSON.parse(stub.calls[1]!.init?.body as string) as { completed: number };
      assert.equal(body.completed, 1);
    } finally {
      stub.restore();
    }
  });

  it('restarts the 8s window on every additional call before it fires', () => {
    const stub = installFetchStub(() => new Response('{}'));
    try {
      noteJobCompletionEmail({ promptId: 'p1', status: 'completed', prompt: 'a' });
      mock.timers.tick(5000);
      noteJobCompletionEmail({ promptId: 'p2', status: 'completed', prompt: 'b' });
      mock.timers.tick(5000);
      // 10s total elapsed but the second call reset the timer at t=5s, so
      // only 5s have passed since the last call — should not have fired yet.
      assert.equal(stub.calls.length, 0);
      mock.timers.tick(3000);
      assert.equal(stub.calls.length, 1);
      const body = JSON.parse(stub.calls[0]!.init?.body as string) as { completed: number };
      assert.equal(body.completed, 2);
    } finally {
      stub.restore();
    }
  });
});
