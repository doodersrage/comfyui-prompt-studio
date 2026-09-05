import assert from 'node:assert/strict';
import { after, afterEach, describe, it, mock } from 'node:test';

let avoidedTokensRequestBodyImpl: () => { avoidedTokens?: string[]; avoidedTokensInstruction?: string } =
  () => ({});
const avoidedTokensRequestBody = mock.fn(() => avoidedTokensRequestBodyImpl());
mock.module('./avoided-tokens', { namedExports: { avoidedTokensRequestBody } });

const registerComfyGalleryJob = mock.fn((_input: unknown) => ({}) as unknown);
mock.module('./comfyui-gallery-client', { namedExports: { registerComfyGalleryJob } });

const scheduleComfyGalleryPoll = mock.fn((_promptId: string, _opts?: unknown) => Promise.resolve(null));
mock.module('./comfyui-gallery-poller', { namedExports: { scheduleComfyGalleryPoll } });

type QueueResult = {
  ok: boolean;
  promptId?: string;
  clientId?: string;
  comfyUrl?: string;
  error?: string;
  releaseLiveSocket: () => void;
};
const releaseLiveSocket = mock.fn(() => {});
let postComfyUiPromptImpl: (body: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  clientId: 'c-1',
  comfyUrl: 'http://127.0.0.1:8188',
  releaseLiveSocket,
});
const postComfyUiPrompt = mock.fn((body: unknown) => postComfyUiPromptImpl(body));
mock.module('./comfyui-queue-request', { namedExports: { postComfyUiPrompt } });

const resolveRuntimeForQueue = mock.fn((_model: string, _tool?: string) => ({
  apiUrl: 'http://127.0.0.1:8188',
  queueQualityProfile: 'final',
}));
mock.module('./comfyui-runtime-for-model', { namedExports: { resolveRuntimeForQueue } });

const injectLoraTriggers = mock.fn((prompt: string) => `lora:${prompt}`);
mock.module('./lora-prompt-injection', { namedExports: { injectLoraTriggers } });

let loadActiveProjectIdImpl: () => string | undefined = () => 'project-1';
const loadActiveProjectId = mock.fn(() => loadActiveProjectIdImpl());
mock.module('./prompt-projects', { namedExports: { loadActiveProjectId } });

let prepareImpl: (input: { positive: string }) => Promise<{ positive: string; negative?: string }> =
  async input => ({ positive: input.positive, negative: undefined });
const prepareQueuePrompts = mock.fn((input: { positive: string }) => prepareImpl(input));
mock.module('./queue-prompt-prep', { namedExports: { prepareQueuePrompts } });

const resolveQueueParams = mock.fn((input: Record<string, unknown>) => ({ resolved: true, ...input }));
mock.module('./queue-params-settings', { namedExports: { resolveQueueParams } });

let guardImpl: (input: unknown) => Promise<{ profile: string; runtime?: unknown; downgraded: boolean }> =
  async input => ({
    profile: 'final',
    runtime: (input as { runtime?: unknown }).runtime,
    downgraded: false,
  });
const guardQueueQualityForVram = mock.fn((input: unknown) => guardImpl(input));
mock.module('./vram-queue-guard', { namedExports: { guardQueueQualityForVram } });

let holdImpl: (input: unknown) => Promise<{ held: boolean; count: number }> = async () => ({
  held: false,
  count: 0,
});
const maybeHoldMaxGenerateJobs = mock.fn((input: unknown) => holdImpl(input));
mock.module('./held-max-queue', { namedExports: { maybeHoldMaxGenerateJobs } });

let rankPromptsWithLlmImpl = async (prompts: string[], keep: number) => prompts.slice(0, keep);
const rankPromptsWithLlm = mock.fn((prompts: string[], keep: number) =>
  rankPromptsWithLlmImpl(prompts, keep)
);
mock.module('./best-of-n-rank', { namedExports: { rankPromptsWithLlm } });

const toastQueueOutcome = mock.fn((_input: unknown) => 'toast-id');
mock.module('./app-toast', { namedExports: { toastQueueOutcome } });

type FetchResponse = { ok: boolean; json: () => Promise<unknown> };
let fetchImpl: (url: string, init?: unknown) => Promise<FetchResponse> = async url => {
  if (typeof url === 'string' && url.includes('/api/topics/batch')) {
    return { ok: true, json: async () => ({ results: [{ prompt: 'topic prompt one' }] }) };
  }
  return { ok: true, json: async () => ({ prompt: 'random scene prompt' }) };
};
const fetchMock = mock.fn((url: string, init?: unknown) => fetchImpl(url, init));
const originalFetch = globalThis.fetch;
globalThis.fetch = fetchMock as unknown as typeof fetch;

function resetMocks() {
  for (const m of [
    avoidedTokensRequestBody,
    registerComfyGalleryJob,
    scheduleComfyGalleryPoll,
    postComfyUiPrompt,
    releaseLiveSocket,
    resolveRuntimeForQueue,
    injectLoraTriggers,
    loadActiveProjectId,
    prepareQueuePrompts,
    resolveQueueParams,
    guardQueueQualityForVram,
    maybeHoldMaxGenerateJobs,
    rankPromptsWithLlm,
    toastQueueOutcome,
    fetchMock,
  ]) {
    m.mock.resetCalls();
  }
  avoidedTokensRequestBodyImpl = () => ({});
  postComfyUiPromptImpl = async () => ({
    ok: true,
    promptId: 'p-1',
    clientId: 'c-1',
    comfyUrl: 'http://127.0.0.1:8188',
    releaseLiveSocket,
  });
  loadActiveProjectIdImpl = () => 'project-1';
  prepareImpl = async input => ({ positive: input.positive, negative: undefined });
  guardImpl = async input => ({
    profile: 'final',
    runtime: (input as { runtime?: unknown }).runtime,
    downgraded: false,
  });
  holdImpl = async () => ({ held: false, count: 0 });
  rankPromptsWithLlmImpl = async (prompts, keep) => prompts.slice(0, keep);
  fetchImpl = async url => {
    if (typeof url === 'string' && url.includes('/api/topics/batch')) {
      return { ok: true, json: async () => ({ results: [{ prompt: 'topic prompt one' }] }) };
    }
    return { ok: true, json: async () => ({ prompt: 'random scene prompt' }) };
  };
}

afterEach(resetMocks);
// NOTE: restoring the real fetch must happen once, after ALL tests in this
// file (via `after`), not per-test (via `afterEach`) -- an afterEach here
// would undo the module-scope fetch mock after the first test, leaving every
// subsequent test to hit the real global fetch with a relative URL like
// '/api/random-scene', which undici rejects with "Failed to parse URL".
after(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe('campaign-runner', async () => {
  const { runPromptCampaign } = await import('./campaign-runner');

  it('generates random-scene prompts and queues them to ComfyUI', async () => {
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 2,
      queueToComfyUi: true,
    });
    assert.equal(results.length, 2);
    assert.ok(results.every(r => r.queued));
    assert.equal(results[0]!.prompt, 'lora:random scene prompt');
    assert.equal(registerComfyGalleryJob.mock.calls.length, 2);
    assert.equal(scheduleComfyGalleryPoll.mock.calls.length, 2);
  });

  it('fetches topics in one batch call and queues each resulting prompt', async () => {
    fetchImpl = async url => {
      if (typeof url === 'string' && url.includes('/api/topics/batch')) {
        return {
          ok: true,
          json: async () => ({ results: [{ prompt: 'a fox' }, { prompt: 'a bear' }] }),
        };
      }
      throw new Error('unexpected fetch: ' + url);
    };
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'topics',
      topics: ['fox', 'bear'],
      count: 2,
      queueToComfyUi: true,
    });
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(results.length, 2);
    assert.deepEqual(
      results.map(r => r.prompt),
      ['lora:a fox', 'lora:a bear']
    );
  });

  it('spreads avoidedTokensRequestBody into the topics-batch request body', async () => {
    avoidedTokensRequestBodyImpl = () => ({ avoidedTokens: ['blurry'] });
    await runPromptCampaign({
      model: 'sdxl',
      target: 'topics',
      topics: ['fox'],
      count: 1,
      queueToComfyUi: false,
    });
    const [, init] = fetchMock.mock.calls[0]!.arguments as [string, { body: string }];
    const body = JSON.parse(init.body) as { avoidedTokens?: string[] };
    assert.deepEqual(body.avoidedTokens, ['blurry']);
  });

  it('spreads avoidedTokensRequestBody into each random-scene request body', async () => {
    avoidedTokensRequestBodyImpl = () => ({ avoidedTokens: ['watermark'] });
    await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: false,
    });
    const [, init] = fetchMock.mock.calls[0]!.arguments as [string, { body: string }];
    const body = JSON.parse(init.body) as { avoidedTokens?: string[] };
    assert.deepEqual(body.avoidedTokens, ['watermark']);
  });

  it('throws when the topics batch request fails', async () => {
    fetchImpl = async () => ({ ok: false, json: async () => ({ error: 'boom' }) });
    await assert.rejects(
      runPromptCampaign({
        model: 'sdxl',
        target: 'topics',
        topics: ['fox'],
        count: 1,
        queueToComfyUi: false,
      }),
      /boom/
    );
  });

  it('throws a default message when the topics batch request fails without an error field', async () => {
    fetchImpl = async () => ({ ok: false, json: async () => ({}) });
    await assert.rejects(
      runPromptCampaign({
        model: 'sdxl',
        target: 'topics',
        topics: ['fox'],
        count: 1,
        queueToComfyUi: false,
      }),
      /Topics batch failed\./
    );
  });

  it('records a per-item error and continues when a random-scene fetch call fails', async () => {
    let call = 0;
    fetchImpl = async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, json: async () => ({ error: 'scene failed' }) };
      }
      return { ok: true, json: async () => ({ prompt: 'scene two' }) };
    };
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 2,
      queueToComfyUi: false,
    });
    assert.equal(results.length, 2);
    assert.equal(results[0]!.queued, false);
    assert.equal(results[0]!.error, 'scene failed');
    assert.equal(results[1]!.prompt, 'lora:scene two');
  });

  it('does not call the queue pipeline when queueToComfyUi is false', async () => {
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: false,
    });
    assert.equal(results[0]!.queued, false);
    assert.equal(results[0]!.prompt, 'lora:random scene prompt');
    assert.equal(prepareQueuePrompts.mock.calls.length, 0);
    assert.equal(postComfyUiPrompt.mock.calls.length, 0);
  });

  it('marks a result held (without queuing) when maybeHoldMaxGenerateJobs holds it', async () => {
    holdImpl = async () => ({ held: true, count: 1 });
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: true,
    });
    assert.equal(results[0]!.held, true);
    assert.equal(results[0]!.queued, false);
    assert.equal(postComfyUiPrompt.mock.calls.length, 0);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('records the queue error and releases the live socket when postComfyUiPrompt fails', async () => {
    postComfyUiPromptImpl = async () => ({
      ok: false,
      error: 'ComfyUI unreachable',
      releaseLiveSocket,
    });
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: true,
    });
    assert.equal(results[0]!.queued, false);
    assert.equal(results[0]!.error, 'ComfyUI unreachable');
    assert.equal(releaseLiveSocket.mock.calls.length, 1);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('uses a default "ComfyUI queue failed." error when the queue fails without a message', async () => {
    postComfyUiPromptImpl = async () => ({ ok: false, releaseLiveSocket });
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: true,
    });
    assert.equal(results[0]!.error, 'ComfyUI queue failed.');
  });

  it('uses the same default error when the queue reports ok without a promptId', async () => {
    postComfyUiPromptImpl = async () => ({ ok: true, releaseLiveSocket });
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: true,
    });
    assert.equal(results[0]!.error, 'ComfyUI queue failed.');
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('registers a gallery job and schedules a poll with the active project id on success', async () => {
    loadActiveProjectIdImpl = () => 'proj-42';
    await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: true,
    });
    assert.equal(registerComfyGalleryJob.mock.calls.length, 1);
    const arg = registerComfyGalleryJob.mock.calls[0]!.arguments[0] as { projectId?: string };
    assert.equal(arg.projectId, 'proj-42');
    assert.equal(scheduleComfyGalleryPoll.mock.calls.length, 1);
    assert.equal(scheduleComfyGalleryPoll.mock.calls[0]!.arguments[0], 'p-1');
  });

  it('ranks prompts with rankPromptsWithLlm when bestOfN > 1 generates more prompts than requested', async () => {
    fetchImpl = async () => ({ ok: true, json: async () => ({ prompt: 'scene' }) });
    await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      bestOfN: 3,
      queueToComfyUi: false,
    });
    assert.equal(rankPromptsWithLlm.mock.calls.length, 1);
    const [prompts, keep] = rankPromptsWithLlm.mock.calls[0]!.arguments;
    assert.equal((prompts as string[]).length, 3);
    assert.equal(keep, 1);
  });

  it('clamps count to at most 12 and bestOfN to at most 4', async () => {
    let callCount = 0;
    fetchImpl = async () => {
      callCount += 1;
      return { ok: true, json: async () => ({ prompt: `scene-${callCount}` }) };
    };
    await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 100,
      bestOfN: 10,
      queueToComfyUi: false,
    });
    // generateCount = count(12) * bestOfN(4) = 48 random-scene fetch calls.
    assert.equal(callCount, 48);
  });

  it('clamps count and bestOfN to at least 1', async () => {
    let callCount = 0;
    fetchImpl = async () => {
      callCount += 1;
      return { ok: true, json: async () => ({ prompt: 'scene' }) };
    };
    const results = await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 0,
      bestOfN: 0,
      queueToComfyUi: false,
    });
    assert.equal(callCount, 1);
    assert.equal(results.length, 1);
  });

  it('falls back to the base runtime when guardQueueQualityForVram returns no runtime', async () => {
    guardImpl = async () => ({ profile: 'final', runtime: undefined, downgraded: false });
    await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      queueToComfyUi: true,
    });
    const postArg = postComfyUiPrompt.mock.calls[0]!.arguments[0] as { comfy?: unknown };
    assert.deepEqual(postArg.comfy, resolveRuntimeForQueue.mock.calls[0]!.result);
  });

  it('does not run the post-queue vision-cull / toast path when bestOfNVision is off', async () => {
    // NOTE: the vision-rank branch (`useVisionRank`) reaches its outcome via a call-time
    // `await import('./best-of-n-vision-queue')` inside campaign-runner.ts. Per this sweep's
    // established rule, mock.module() is not relied on to intercept a dynamic import, so that
    // branch (and its toastQueueOutcome call) is intentionally left unexercised here rather than
    // faked into a false pass. This test only pins down that the ordinary (non-vision) path never
    // touches toastQueueOutcome.
    await runPromptCampaign({
      model: 'sdxl',
      target: 'random-scene',
      count: 1,
      bestOfN: 2,
      bestOfNVision: false,
      queueToComfyUi: true,
    });
    assert.equal(toastQueueOutcome.mock.calls.length, 0);
  });
});
