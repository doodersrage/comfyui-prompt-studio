import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyUiQueueRequestResult } from './comfyui-queue-request';

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const resolveRuntimeForQueue = mock.fn((_model: string, _tool?: string) => ({
  apiUrl: 'http://127.0.0.1:8188',
  queueQualityProfile: 'final',
}));
mock.module('./comfyui-runtime-for-model', { namedExports: { resolveRuntimeForQueue } });

const registerComfyGalleryJob = mock.fn((_input: unknown) => ({}) as unknown);
mock.module('./comfyui-gallery-client', { namedExports: { registerComfyGalleryJob } });

const scheduleComfyGalleryPoll = mock.fn((_promptId: string, _opts?: unknown) => Promise.resolve(null));
mock.module('./comfyui-gallery-poller', { namedExports: { scheduleComfyGalleryPoll } });

type QueueResult = Partial<ComfyUiQueueRequestResult> & { releaseLiveSocket: () => void };
let postComfyUiPromptImpl: (body: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  clientId: 'c-1',
  comfyUrl: 'http://127.0.0.1:8188',
  releaseLiveSocket: () => {},
});
const postComfyUiPrompt = mock.fn((body: unknown) => postComfyUiPromptImpl(body));
mock.module('./comfyui-queue-request', { namedExports: { postComfyUiPrompt } });

const resolveQueueParams = mock.fn((input: Record<string, unknown>) => ({ resolved: true, ...input }));
mock.module('./queue-params-settings', { namedExports: { resolveQueueParams } });

let guardImpl: (input: unknown) => Promise<{ profile: string; runtime?: unknown; downgraded: boolean }> =
  async input => ({ profile: 'final', runtime: (input as { runtime?: unknown }).runtime, downgraded: false });
const guardQueueQualityForVram = mock.fn((input: unknown) => guardImpl(input));
mock.module('./vram-queue-guard', { namedExports: { guardQueueQualityForVram } });

let holdImpl: (input: unknown) => Promise<{ held: boolean; count: number }> = async () => ({
  held: false,
  count: 0,
});
const maybeHoldMaxGenerateJobs = mock.fn((input: unknown) => holdImpl(input));
mock.module('./held-max-queue', { namedExports: { maybeHoldMaxGenerateJobs } });

const prepareQueuePrompts = mock.fn((input: { positive: string }) =>
  Promise.resolve({ positive: input.positive, negative: 'neg' })
);
mock.module('./queue-prompt-prep', { namedExports: { prepareQueuePrompts } });

function resetMocks() {
  for (const m of [
    resolveRuntimeForQueue,
    registerComfyGalleryJob,
    scheduleComfyGalleryPoll,
    postComfyUiPrompt,
    resolveQueueParams,
    guardQueueQualityForVram,
    maybeHoldMaxGenerateJobs,
    prepareQueuePrompts,
  ]) {
    m.mock.resetCalls();
  }
  postComfyUiPromptImpl = async () => ({
    ok: true,
    promptId: 'p-1',
    clientId: 'c-1',
    comfyUrl: 'http://127.0.0.1:8188',
    releaseLiveSocket: () => {},
  });
  guardImpl = async input => ({
    profile: 'final',
    runtime: (input as { runtime?: unknown }).runtime,
    downgraded: false,
  });
  holdImpl = async () => ({ held: false, count: 0 });
}

afterEach(resetMocks);

describe('model-portfolio', async () => {
  const { generateModelPortfolio, queueModelPortfolio } = await import('./model-portfolio');

  describe('generateModelPortfolio', () => {
    it('formats a prompt per model and collects successes', async () => {
      const stub = installFetchStub(() => Response.json({ prompt: 'a formatted prompt' }));
      try {
        const results = await generateModelPortfolio({
          draft: '  a raw draft  ',
          models: ['sdxl', 'flux-2-klein-4b-distilled'] as unknown as never[],
        });
        assert.equal(results.length, 2);
        assert.deepEqual(
          results.map(r => r.prompt),
          ['a formatted prompt', 'a formatted prompt']
        );
        assert.equal(stub.calls.length, 2);
        const body = JSON.parse(stub.calls[0]!.init?.body as string);
        assert.equal(body.input, 'a raw draft');
        assert.equal(body.smartFormat, true);
        assert.equal(body.detail, 'balanced');
      } finally {
        stub.restore();
      }
    });

    it('records an error result on a non-ok response, without throwing', async () => {
      const stub = installFetchStub(() => Response.json({ error: 'bad model' }, { status: 400 }));
      try {
        const results = await generateModelPortfolio({ draft: 'x', models: ['sdxl'] as unknown as never[] });
        assert.equal(results[0]?.prompt, '');
        assert.equal(results[0]?.error, 'bad model');
      } finally {
        stub.restore();
      }
    });

    it('records a generic error when the response has no prompt and no error message', async () => {
      const stub = installFetchStub(() => Response.json({}, { status: 200 }));
      try {
        const results = await generateModelPortfolio({ draft: 'x', models: ['sdxl'] as unknown as never[] });
        assert.equal(results[0]?.error, 'Format failed.');
      } finally {
        stub.restore();
      }
    });

    it('records the thrown error message when fetch itself rejects', async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch;
      try {
        const results = await generateModelPortfolio({ draft: 'x', models: ['sdxl'] as unknown as never[] });
        assert.equal(results[0]?.error, 'network down');
      } finally {
        globalThis.fetch = original;
      }
    });

    it('respects an explicit detail level', async () => {
      const stub = installFetchStub(() => Response.json({ prompt: 'ok' }));
      try {
        await generateModelPortfolio({ draft: 'x', models: ['sdxl'] as unknown as never[], detail: 'rich' });
        const body = JSON.parse(stub.calls[0]!.init?.body as string);
        assert.equal(body.detail, 'rich');
      } finally {
        stub.restore();
      }
    });
  });

  describe('queueModelPortfolio', () => {
    it('skips items with a blank prompt', async () => {
      const result = await queueModelPortfolio({
        items: [{ model: 'sdxl' as unknown as never, prompt: '   ' }],
      });
      assert.deepEqual(result, { queued: 0, held: 0 });
      assert.equal(postComfyUiPrompt.mock.calls.length, 0);
    });

    it('queues an item successfully, registering the gallery job and scheduling a poll', async () => {
      const result = await queueModelPortfolio({
        items: [{ model: 'sdxl' as unknown as never, prompt: 'a prompt' }],
        hints: 'h',
        tool: 'portfolio',
      });
      assert.deepEqual(result, { queued: 1, held: 0 });
      assert.equal(registerComfyGalleryJob.mock.calls.length, 1);
      assert.equal(scheduleComfyGalleryPoll.mock.calls.length, 1);
      const registerArgs = registerComfyGalleryJob.mock.calls[0]!.arguments[0] as {
        promptId: string;
        model: string;
      };
      assert.equal(registerArgs.promptId, 'p-1');
      assert.equal(registerArgs.model, 'sdxl');
    });

    it('counts a held job without queuing it', async () => {
      holdImpl = async () => ({ held: true, count: 1 });
      const result = await queueModelPortfolio({
        items: [{ model: 'sdxl' as unknown as never, prompt: 'a prompt' }],
      });
      assert.deepEqual(result, { queued: 0, held: 1 });
      assert.equal(postComfyUiPrompt.mock.calls.length, 0);
    });

    it('does not count a failed queue request as queued, still releases the socket', async () => {
      let released = false;
      postComfyUiPromptImpl = async () => ({
        ok: false,
        releaseLiveSocket: () => {
          released = true;
        },
      });
      const result = await queueModelPortfolio({
        items: [{ model: 'sdxl' as unknown as never, prompt: 'a prompt' }],
      });
      assert.deepEqual(result, { queued: 0, held: 0 });
      assert.equal(released, true);
      assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
    });

    it('defaults tool to "portfolio" when not provided', async () => {
      await queueModelPortfolio({ items: [{ model: 'sdxl' as unknown as never, prompt: 'x' }] });
      const runtimeArgs = resolveRuntimeForQueue.mock.calls[0]!.arguments;
      assert.equal(runtimeArgs[1], 'portfolio');
    });

    it('processes multiple items independently, summing queued/held', async () => {
      let call = 0;
      holdImpl = async () => {
        call += 1;
        return { held: call === 1, count: call === 1 ? 1 : 0 };
      };
      const result = await queueModelPortfolio({
        items: [
          { model: 'sdxl' as unknown as never, prompt: 'p1' },
          { model: 'flux' as unknown as never, prompt: 'p2' },
        ],
      });
      assert.deepEqual(result, { queued: 1, held: 1 });
    });
  });
});
