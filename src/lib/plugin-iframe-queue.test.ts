import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let requeueImpl: (input: unknown) => Promise<{
  ok: boolean;
  error?: string;
  held?: boolean;
  promptId?: string;
}> = async () => ({ ok: true, promptId: 'prompt-1' });
const requeueComfyJob = mock.fn((input: unknown) => requeueImpl(input));
mock.module('./comfyui-requeue', { namedExports: { requeueComfyJob } });

let galleryEntries: Array<{ id: string }> = [{ id: 'entry-1' }];
const setComfyGalleryUserTags = mock.fn((_ids: string[], _tags: string[], _mode?: string) => {});
const loadComfyGallery = mock.fn(() => galleryEntries);
mock.module('./comfyui-gallery', { namedExports: { setComfyGalleryUserTags, loadComfyGallery } });

let comfyUiSettings: { customTokens?: Array<{ token: string; value: string }> } = { customTokens: [] };
const loadComfyUiSettings = mock.fn(() => comfyUiSettings);
const saveComfyUiSettings = mock.fn((settings: unknown) => {
  comfyUiSettings = settings as typeof comfyUiSettings;
});
const resolveSharedEffectiveSessionLoraIds = mock.fn((_model?: string) => ['lora-a'] as
  | string[]
  | undefined);
mock.module('./comfyui-settings', {
  namedExports: { loadComfyUiSettings, saveComfyUiSettings, resolveSharedEffectiveSessionLoraIds },
});

const rememberToolDraft = mock.fn((_input: unknown) => {});
mock.module('./tool-draft-memory', { namedExports: { rememberToolDraft } });

let sharedSettings: Record<string, unknown> = {
  model: 'sdxl',
  queueQualityProfile: 'final',
  inferenceEngine: 'comfyui',
  selectedWorkflowFileId: undefined,
  sessionActiveLoraIdsByModel: {},
};
const loadSettingsCache = mock.fn(() => ({ shared: sharedSettings }));
const saveSharedSettings = mock.fn((next: Record<string, unknown>, _opts?: unknown) => {
  sharedSettings = next;
});
mock.module('./settings-cache', { namedExports: { loadSettingsCache, saveSharedSettings } });

const saveEngineSettings = mock.fn((_input: unknown) => {});
mock.module('./engine-settings', { namedExports: { saveEngineSettings } });

let preflightImpl: (payload: unknown) => Promise<{
  payload: { prompt?: string; negativePrompt?: string; model?: string };
  blocked: boolean;
  messages: string[];
  reason?: string;
}> = async payload => ({ payload: payload as never, blocked: false, messages: [] });
const runPluginQueuePreflight = mock.fn((payload: unknown) => preflightImpl(payload));
mock.module('./plugin-queue-hooks', { namedExports: { runPluginQueuePreflight } });

function resetMocks() {
  for (const m of [
    requeueComfyJob,
    setComfyGalleryUserTags,
    loadComfyGallery,
    loadComfyUiSettings,
    saveComfyUiSettings,
    resolveSharedEffectiveSessionLoraIds,
    rememberToolDraft,
    loadSettingsCache,
    saveSharedSettings,
    saveEngineSettings,
    runPluginQueuePreflight,
  ]) {
    m.mock.resetCalls();
  }
  requeueImpl = async () => ({ ok: true, promptId: 'prompt-1' });
  galleryEntries = [{ id: 'entry-1' }];
  comfyUiSettings = { customTokens: [] };
  sharedSettings = {
    model: 'sdxl',
    queueQualityProfile: 'final',
    inferenceEngine: 'comfyui',
    selectedWorkflowFileId: undefined,
    sessionActiveLoraIdsByModel: {},
  };
  preflightImpl = async payload => ({ payload: payload as never, blocked: false, messages: [] });
}

afterEach(resetMocks);

describe('plugin-iframe-queue', async () => {
  const {
    applyPromptFromPlugin,
    applyModelFromPlugin,
    applyQualityFromPlugin,
    applyEngineFromPlugin,
    applyLoraStackFromPlugin,
    patchWorkflowTokensFromPlugin,
    writeGalleryTagFromPlugin,
    buildPluginHostContextSnapshot,
    queuePromptFromPlugin,
  } = await import('./plugin-iframe-queue');

  describe('applyPromptFromPlugin', () => {
    it('rejects an empty prompt', async () => {
      const result = await applyPromptFromPlugin('demo', { prompt: '   ' });
      assert.equal(result.ok, false);
    });

    it('remembers the prompt as a tool draft keyed by plugin id and reports success', async () => {
      const result = await applyPromptFromPlugin('demo', { prompt: 'a scene' });
      assert.equal(result.ok, true);
      assert.equal(rememberToolDraft.mock.calls.length, 1);
      const arg = rememberToolDraft.mock.calls[0]!.arguments[0] as { toolKey: string; text: string };
      assert.equal(arg.toolKey, 'plugin:demo');
      assert.equal(arg.text, 'a scene');
    });
  });

  describe('applyModelFromPlugin', () => {
    it('rejects a blank model id', async () => {
      const result = await applyModelFromPlugin({ model: ' ' });
      assert.equal(result.ok, false);
      assert.equal(saveSharedSettings.mock.calls.length, 0);
    });

    it('saves the trimmed model into shared settings with notify:true', async () => {
      const result = await applyModelFromPlugin({ model: ' flux-2-klein ' });
      assert.equal(result.ok, true);
      assert.match(result.message, /flux-2-klein/);
      const [next, opts] = saveSharedSettings.mock.calls[0]!.arguments as [
        Record<string, unknown>,
        { notify?: boolean },
      ];
      assert.equal(next.model, 'flux-2-klein');
      assert.deepEqual(opts, { notify: true });
    });
  });

  describe('applyQualityFromPlugin', () => {
    it('normalizes an invalid quality profile to the default before saving', async () => {
      const result = await applyQualityFromPlugin({ qualityProfile: 'bogus' as never });
      assert.equal(result.ok, true);
      assert.match(result.message, /Quality profile set to/);
      const [next] = saveSharedSettings.mock.calls[0]!.arguments as [Record<string, unknown>];
      assert.equal(next.queueQualityProfile, 'followSettings');
    });

    it('accepts a valid quality profile as-is', async () => {
      const result = await applyQualityFromPlugin({ qualityProfile: 'max' });
      assert.equal(result.message, 'Quality profile set to max.');
    });
  });

  describe('applyEngineFromPlugin', () => {
    it('rejects an unknown engine id', async () => {
      const result = await applyEngineFromPlugin({ engine: 'not-a-real-engine' });
      assert.equal(result.ok, false);
      assert.equal(saveEngineSettings.mock.calls.length, 0);
    });

    it('normalizes and saves a known engine id', async () => {
      const result = await applyEngineFromPlugin({ engine: 'comfyui' });
      assert.equal(result.ok, true);
      assert.equal(result.message, 'Inference engine set to comfyui.');
      assert.deepEqual(saveEngineSettings.mock.calls[0]!.arguments[0], { engine: 'comfyui' });
    });
  });

  describe('applyLoraStackFromPlugin', () => {
    it('rejects a non-array loraIds', async () => {
      const result = await applyLoraStackFromPlugin({ loraIds: 'nope' as never });
      assert.equal(result.ok, false);
    });

    it('rejects when there is no active model to attach the stack to', async () => {
      sharedSettings = { ...sharedSettings, model: '' };
      const result = await applyLoraStackFromPlugin({ loraIds: ['a'] });
      assert.equal(result.ok, false);
      assert.match(result.message, /No active model/);
    });

    it('dedupes, trims, and caps loraIds at 48, saving them under the active model', async () => {
      const ids = Array.from({ length: 60 }, (_, i) => `lora-${i}`);
      const result = await applyLoraStackFromPlugin({ loraIds: [...ids, ...ids, ' '] });
      assert.equal(result.ok, true);
      assert.match(result.message, /LoRA stack set \(48\) for sdxl/);
      const [next] = saveSharedSettings.mock.calls[0]!.arguments as [
        { sessionActiveLoraIdsByModel: Record<string, string[]> },
      ];
      assert.equal(next.sessionActiveLoraIdsByModel.sdxl!.length, 48);
    });

    it('reports a cleared stack when loraIds is empty', async () => {
      const result = await applyLoraStackFromPlugin({ loraIds: [] });
      assert.equal(result.message, 'LoRA stack cleared for sdxl.');
    });

    it('uses the payload model over the shared active model when given', async () => {
      const result = await applyLoraStackFromPlugin({ loraIds: ['a'], model: 'flux-2-klein' });
      assert.match(result.message, /for flux-2-klein/);
    });
  });

  describe('patchWorkflowTokensFromPlugin', () => {
    it('rejects a missing or empty tokens array', async () => {
      const empty = await patchWorkflowTokensFromPlugin({ tokens: [] });
      assert.equal(empty.ok, false);
      const missing = await patchWorkflowTokensFromPlugin({ tokens: undefined as never });
      assert.equal(missing.ok, false);
    });

    it('rejects when every token entry is blank after filtering', async () => {
      const result = await patchWorkflowTokensFromPlugin({ tokens: [{ token: '  ', value: 'x' }] });
      assert.equal(result.ok, false);
      assert.match(result.message, /No valid workflow tokens/);
    });

    it('normalizes token braces, upserts by key, and saves merged customTokens', async () => {
      comfyUiSettings = { customTokens: [{ token: '{{existing}}', value: 'old' }] };
      const result = await patchWorkflowTokensFromPlugin({
        tokens: [
          { token: 'newtoken', value: 'v1' },
          { token: '{{existing}}', value: 'updated' },
        ],
      });
      assert.equal(result.ok, true);
      assert.match(result.message, /Patched 2 workflow token/);
      const saved = saveComfyUiSettings.mock.calls[0]!.arguments[0] as {
        customTokens: Array<{ token: string; value: string }>;
      };
      assert.equal(saved.customTokens.length, 2);
      const existing = saved.customTokens.find(entry => entry.token === '{{existing}}');
      assert.equal(existing!.value, 'updated');
      const added = saved.customTokens.find(entry => entry.token === '{{newtoken}}');
      assert.equal(added!.value, 'v1');
    });

    it('coerces non-string values to strings', async () => {
      const result = await patchWorkflowTokensFromPlugin({
        tokens: [{ token: 'count', value: 5 as unknown as string }],
      });
      assert.equal(result.ok, true);
      const saved = saveComfyUiSettings.mock.calls[0]!.arguments[0] as {
        customTokens: Array<{ token: string; value: string }>;
      };
      assert.equal(saved.customTokens[0]!.value, '5');
    });
  });

  describe('writeGalleryTagFromPlugin', () => {
    it('rejects a blank tag', async () => {
      const result = await writeGalleryTagFromPlugin({ tag: '  ' });
      assert.equal(result.ok, false);
    });

    it('defaults to the most recent gallery entry when no entryIds are given', async () => {
      const result = await writeGalleryTagFromPlugin({ tag: 'favorite' });
      assert.equal(result.ok, true);
      assert.deepEqual(setComfyGalleryUserTags.mock.calls[0]!.arguments, [
        ['entry-1'],
        ['favorite'],
        'add',
      ]);
      assert.match(result.message, /written on 1 entry/);
    });

    it('reports gallery-empty when there are no entries and none were given explicitly', async () => {
      galleryEntries = [];
      const result = await writeGalleryTagFromPlugin({ tag: 'favorite' });
      assert.equal(result.ok, false);
      assert.match(result.message, /Gallery is empty/);
    });

    it('uses given entryIds and the remove mode, pluralizing the message for multiple entries', async () => {
      const result = await writeGalleryTagFromPlugin({
        tag: 'favorite',
        entryIds: ['a', 'b'],
        mode: 'remove',
      });
      assert.equal(result.ok, true);
      assert.deepEqual(setComfyGalleryUserTags.mock.calls[0]!.arguments, [
        ['a', 'b'],
        ['favorite'],
        'remove',
      ]);
      assert.match(result.message, /removed from 2 entries/);
    });
  });

  describe('buildPluginHostContextSnapshot', () => {
    it('assembles a snapshot from shared settings and the resolved session LoRA ids', () => {
      const snapshot = buildPluginHostContextSnapshot({ pluginId: 'demo', tool: 'generate' });
      assert.equal(snapshot.pluginId, 'demo');
      assert.equal(snapshot.model, 'sdxl');
      assert.equal(snapshot.tool, 'generate');
      assert.equal(snapshot.qualityProfile, 'final');
      assert.equal(snapshot.engine, 'comfyui');
      assert.deepEqual(snapshot.sessionActiveLoraIds, ['lora-a']);
    });
  });

  describe('queuePromptFromPlugin', () => {
    it('rejects an empty prompt', async () => {
      const result = await queuePromptFromPlugin('demo', { prompt: '  ' });
      assert.equal(result.ok, false);
      assert.equal(runPluginQueuePreflight.mock.calls.length, 0);
    });

    it('blocks the queue when preflight reports blocked with a reason', async () => {
      preflightImpl = async payload => ({
        payload: payload as never,
        blocked: true,
        messages: [],
        reason: 'NSFW gate',
      });
      const result = await queuePromptFromPlugin('demo', { prompt: 'x' });
      assert.equal(result.ok, false);
      assert.equal(result.message, 'NSFW gate');
      assert.equal(requeueComfyJob.mock.calls.length, 0);
    });

    it('falls back to joined messages, then a generic message, when preflight blocks without a reason', async () => {
      preflightImpl = async payload => ({
        payload: payload as never,
        blocked: true,
        messages: ['hook A failed', 'hook B failed'],
      });
      const withMessages = await queuePromptFromPlugin('demo', { prompt: 'x' });
      assert.equal(withMessages.message, 'hook A failed · hook B failed');

      preflightImpl = async payload => ({ payload: payload as never, blocked: true, messages: [] });
      const generic = await queuePromptFromPlugin('demo', { prompt: 'x' });
      assert.equal(generic.message, 'Plugin queue preflight blocked the job.');
    });

    it('queues via requeueComfyJob using the preflight-adjusted payload and remembers the draft', async () => {
      preflightImpl = async payload => ({
        payload: { ...(payload as { prompt: string }), prompt: 'adjusted prompt' },
        blocked: false,
        messages: [],
      });
      const result = await queuePromptFromPlugin('demo', {
        prompt: 'original',
        denoise: 0.5,
        cfg: 7,
        qualityProfile: 'max',
      });
      assert.equal(result.ok, true);
      assert.equal(result.message, 'Queued from plugin.');
      assert.equal(result.promptId, 'prompt-1');
      const requeueArg = requeueComfyJob.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(requeueArg.prompt, 'adjusted prompt');
      assert.deepEqual(requeueArg.queueParams, { denoise: '0.5', cfg: '7' });
      assert.equal(requeueArg.qualityProfile, 'max');
      const draftArg = rememberToolDraft.mock.calls[0]!.arguments[0] as { text: string };
      assert.equal(draftArg.text, 'adjusted prompt');
    });

    it('omits queueParams entirely when denoise/cfg are not finite numbers', async () => {
      await queuePromptFromPlugin('demo', { prompt: 'x', denoise: Number.NaN });
      const requeueArg = requeueComfyJob.mock.calls[0]!.arguments[0] as Record<string, unknown>;
      assert.equal(requeueArg.queueParams, undefined);
    });

    it('reports a held message without failing when the queue holds the job', async () => {
      requeueImpl = async () => ({ ok: true, held: true, promptId: 'prompt-2' });
      const result = await queuePromptFromPlugin('demo', { prompt: 'x' });
      assert.equal(result.ok, true);
      assert.equal(result.message, 'Max held until queue is idle.');
    });

    it('surfaces the requeue error message on failure, or a fallback when none is given', async () => {
      requeueImpl = async () => ({ ok: false, error: 'comfy offline' });
      const withError = await queuePromptFromPlugin('demo', { prompt: 'x' });
      assert.equal(withError.ok, false);
      assert.equal(withError.message, 'comfy offline');

      requeueImpl = async () => ({ ok: false });
      const withoutError = await queuePromptFromPlugin('demo', { prompt: 'x' });
      assert.equal(withoutError.message, 'ComfyUI queue failed.');
    });
  });
});
