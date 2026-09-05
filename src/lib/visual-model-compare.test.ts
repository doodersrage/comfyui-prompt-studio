import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const registerComfyGalleryJob = mock.fn((_input: unknown) => ({}) as unknown);
mock.module('./comfyui-gallery-client', { namedExports: { registerComfyGalleryJob } });

type PollEntry = { status?: string; statusMessage?: string } | null;
let pollResult: PollEntry = { status: 'complete' };
const scheduleComfyGalleryPoll = mock.fn((_promptId: string, opts?: { onStatus?: (m: string) => void }) => {
  opts?.onStatus?.('polled');
  return Promise.resolve(pollResult);
});
mock.module('./comfyui-gallery-poller', { namedExports: { scheduleComfyGalleryPoll } });

type QueueResult = {
  ok: boolean;
  promptId?: string;
  clientId?: string;
  comfyUrl?: string;
  error?: string;
  releaseLiveSocket: () => void;
};
let postComfyUiPromptImpl: (body: unknown) => Promise<QueueResult> = async () => ({
  ok: true,
  promptId: 'p-1',
  clientId: 'c-1',
  comfyUrl: 'http://127.0.0.1:8188',
  releaseLiveSocket: () => {},
});
const postComfyUiPrompt = mock.fn((body: unknown) => postComfyUiPromptImpl(body));
mock.module('./comfyui-queue-request', { namedExports: { postComfyUiPrompt } });

const resolveRuntimeForQueue = mock.fn((_model: string, _tool?: string) => ({
  apiUrl: 'http://127.0.0.1:8188',
  queueQualityProfile: 'final',
}));
mock.module('./comfyui-runtime-for-model', { namedExports: { resolveRuntimeForQueue } });

const resolveQueueParams = mock.fn((input: Record<string, unknown>) => ({ resolved: true, ...input }));
mock.module('./queue-params-settings', { namedExports: { resolveQueueParams } });

const galleryEntryPrimaryViewUrl = mock.fn((_entry: unknown) => 'https://cdn/preview.png');
mock.module('./comfyui-gallery', { namedExports: { galleryEntryPrimaryViewUrl } });

let guardImpl: (input: unknown) => Promise<{ profile: string; runtime?: unknown }> = async input => ({
  profile: 'final',
  runtime: (input as { runtime?: unknown }).runtime,
});
const guardQueueQualityForVram = mock.fn((input: unknown) => guardImpl(input));
mock.module('./vram-queue-guard', { namedExports: { guardQueueQualityForVram } });

let holdImpl: (input: unknown) => Promise<{ held: boolean }> = async () => ({ held: false });
const maybeHoldMaxGenerateJobs = mock.fn((input: unknown) => holdImpl(input));
mock.module('./held-max-queue', { namedExports: { maybeHoldMaxGenerateJobs } });

let prepareImpl: (input: { positive: string; explicitNegative?: string }) => Promise<{
  positive: string;
  negative?: string;
}> = async input => ({ positive: input.positive, negative: undefined });
const prepareQueuePrompts = mock.fn(
  (input: { positive: string; explicitNegative?: string }) => prepareImpl(input)
);
mock.module('./queue-prompt-prep', { namedExports: { prepareQueuePrompts } });

function resetMocks() {
  for (const m of [
    registerComfyGalleryJob,
    scheduleComfyGalleryPoll,
    postComfyUiPrompt,
    resolveRuntimeForQueue,
    resolveQueueParams,
    galleryEntryPrimaryViewUrl,
    guardQueueQualityForVram,
    maybeHoldMaxGenerateJobs,
    prepareQueuePrompts,
  ]) {
    m.mock.resetCalls();
  }
  pollResult = { status: 'complete' };
  postComfyUiPromptImpl = async () => ({
    ok: true,
    promptId: 'p-1',
    clientId: 'c-1',
    comfyUrl: 'http://127.0.0.1:8188',
    releaseLiveSocket: () => {},
  });
  guardImpl = async input => ({ profile: 'final', runtime: (input as { runtime?: unknown }).runtime });
  holdImpl = async () => ({ held: false });
  prepareImpl = async input => ({ positive: input.positive, negative: undefined });
}

afterEach(resetMocks);

describe('visual-model-compare', async () => {
  const { runVisualModelCompare } = await import('./visual-model-compare');

  it('queues both models and returns preview urls for a successful compare', async () => {
    const result = await runVisualModelCompare({
      prompt: 'a fox in a forest',
      modelA: 'sdxl' as never,
      modelB: 'flux-2-klein' as never,
    });
    assert.equal(result.a.model, 'sdxl');
    assert.equal(result.b.model, 'flux-2-klein');
    assert.equal(result.a.promptId, 'p-1');
    assert.equal(result.a.previewUrl, 'https://cdn/preview.png');
    assert.equal(result.a.error, undefined);
    assert.equal(result.a.held, undefined);
    assert.equal(registerComfyGalleryJob.mock.calls.length, 2);
  });

  it('uses the same generated seed for both models when no seed is given', async () => {
    await runVisualModelCompare({ prompt: 'x', modelA: 'sdxl' as never, modelB: 'sdxl' as never });
    const seedA = (resolveQueueParams.mock.calls[0]!.arguments[0] as { base: { seed: string } }).base
      .seed;
    const seedB = (resolveQueueParams.mock.calls[1]!.arguments[0] as { base: { seed: string } }).base
      .seed;
    assert.equal(seedA, seedB);
  });

  it('uses the given seed verbatim when provided', async () => {
    await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
      seed: '  42  ',
    });
    const seedA = (resolveQueueParams.mock.calls[0]!.arguments[0] as { base: { seed: string } }).base
      .seed;
    assert.equal(seedA, '42');
  });

  it('marks a model held when maybeHoldMaxGenerateJobs holds it, without queuing', async () => {
    holdImpl = async () => ({ held: true });
    const result = await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
    });
    assert.equal(result.a.held, true);
    assert.equal(result.a.promptId, undefined);
    assert.equal(postComfyUiPrompt.mock.calls.length, 0);
  });

  it('reports an error when the queue request fails', async () => {
    postComfyUiPromptImpl = async () => ({
      ok: false,
      error: 'ComfyUI unreachable',
      releaseLiveSocket: () => {},
    });
    const result = await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
    });
    assert.equal(result.a.error, 'ComfyUI unreachable');
    assert.equal(registerComfyGalleryJob.mock.calls.length, 0);
  });

  it('reports a default "Queue failed." error when the queue request fails without a message', async () => {
    postComfyUiPromptImpl = async () => ({ ok: false, releaseLiveSocket: () => {} });
    const result = await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
    });
    assert.equal(result.a.error, 'Queue failed.');
  });

  it('reports an error when the queue request has no promptId', async () => {
    postComfyUiPromptImpl = async () => ({ ok: true, releaseLiveSocket: () => {} });
    const result = await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
    });
    assert.equal(result.a.error, 'Queue failed.');
  });

  it('surfaces an error-status gallery entry statusMessage as the result error', async () => {
    pollResult = { status: 'error', statusMessage: 'generation failed' };
    const result = await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
    });
    assert.equal(result.a.error, 'generation failed');
  });

  it('leaves previewUrl null when the gallery poll returns no entry', async () => {
    pollResult = null;
    const result = await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'sdxl' as never,
    });
    assert.equal(result.a.previewUrl, null);
  });

  it('calls onStatus with a polling message for each queued model', async () => {
    const messages: string[] = [];
    await runVisualModelCompare({
      prompt: 'x',
      modelA: 'sdxl' as never,
      modelB: 'flux-2-klein' as never,
      onStatus: msg => messages.push(msg),
    });
    assert.ok(messages.includes('Polling sdxl…'));
    assert.ok(messages.includes('Polling flux-2-klein…'));
  });
});
