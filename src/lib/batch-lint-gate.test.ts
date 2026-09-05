import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  batchFixPrompts,
  filterBatchByLintIndexes,
  runBatchLintGate,
} from './batch-lint-gate';

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;

function installFetchStub(impl: FetchImpl) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(impl(url, init));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('batch-lint-gate', () => {
  let restoreFetch: (() => void) | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  describe('runBatchLintGate', () => {
    it('aggregates per-prompt diagnostics and blocks indexes with errors', async () => {
      const stub = installFetchStub(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { prompt?: string };
        if (body.prompt === 'bad') {
          return jsonResponse({
            issues: [
              { severity: 'error', message: 'bad' },
              { severity: 'warn', message: 'meh' },
            ],
          });
        }
        return jsonResponse({
          issues: [{ severity: 'warn', message: 'soft' }],
        });
      });
      restoreFetch = stub.restore;

      const summary = await runBatchLintGate([
        { prompt: 'good', topic: 'topic-a' },
        { prompt: 'bad' },
      ]);

      assert.equal(summary.totalErrors, 1);
      assert.equal(summary.totalWarnings, 2);
      assert.deepEqual(summary.blockedIndexes, [1]);
      assert.equal(summary.items[0].errorCount, 0);
      assert.equal(summary.items[0].warningCount, 1);
      assert.equal(summary.items[0].topic, 'topic-a');
      assert.equal(summary.items[1].errorCount, 1);
      assert.equal(stub.calls[0].url, '/api/lint');
      const firstBody = JSON.parse(String(stub.calls[0].init?.body));
      assert.equal(firstBody.hints, 'topic-a');
      assert.equal(firstBody.prompt, 'good');
    });

    it('prefers an explicit hints argument over the per-item topic', async () => {
      const stub = installFetchStub(async () => jsonResponse({ issues: [] }));
      restoreFetch = stub.restore;
      await runBatchLintGate([{ prompt: 'x', topic: 'topic-a' }], '  global-hints  ');
      const body = JSON.parse(String(stub.calls[0].init?.body));
      assert.equal(body.hints, 'global-hints');
    });

    it('keeps null diagnostics when the lint request fails or throws', async () => {
      let call = 0;
      const stub = installFetchStub(async () => {
        call += 1;
        if (call === 1) return jsonResponse({ issues: [] }, false);
        throw new Error('network');
      });
      restoreFetch = stub.restore;

      const summary = await runBatchLintGate([{ prompt: 'a' }, { prompt: 'b' }]);
      assert.equal(summary.totalErrors, 0);
      assert.deepEqual(summary.blockedIndexes, []);
      assert.equal(summary.items[0].diagnostics, null);
      assert.equal(summary.items[1].diagnostics, null);
    });
  });

  describe('batchFixPrompts', () => {
    it('replaces prompts with the fixed versions from /api/fix', async () => {
      const stub = installFetchStub(async () => jsonResponse({ prompt: '  fixed  ' }));
      restoreFetch = stub.restore;
      const fixed = await batchFixPrompts(['raw'], 'hints');
      assert.deepEqual(fixed, ['fixed']);
      assert.equal(stub.calls[0].url, '/api/fix');
      assert.deepEqual(JSON.parse(String(stub.calls[0].init?.body)), {
        hints: 'hints',
        prompt: 'raw',
      });
    });

    it('falls back to the original prompt when fix fails or returns no prompt', async () => {
      let call = 0;
      const stub = installFetchStub(async () => {
        call += 1;
        if (call === 1) throw new Error('boom');
        return jsonResponse({});
      });
      restoreFetch = stub.restore;
      const fixed = await batchFixPrompts(['keep-a', 'keep-b']);
      assert.deepEqual(fixed, ['keep-a', 'keep-b']);
    });
  });

  describe('filterBatchByLintIndexes', () => {
    it('drops items whose indexes are in the blocked set', () => {
      assert.deepEqual(filterBatchByLintIndexes(['a', 'b', 'c'], [1]), ['a', 'c']);
      assert.deepEqual(filterBatchByLintIndexes(['a', 'b'], []), ['a', 'b']);
      assert.deepEqual(filterBatchByLintIndexes(['a', 'b'], [0, 1]), []);
    });
  });
});
