import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { EnsureMediaWorkflowResult } from './ensure-media-workflow';

let objectInfoImpl: (opts: unknown) => Promise<unknown> = async () => ({ models: [] });
const fetchComfyObjectInfoCached = mock.fn((opts: unknown) => objectInfoImpl(opts));
mock.module('./comfyui-object-info-cache', { namedExports: { fetchComfyObjectInfoCached } });

let audioModelImpl = (_model: string) => true;
let meshModelImpl = (_model: string) => true;
const isAudioModel = mock.fn((model: string) => audioModelImpl(model));
const isMeshModel = mock.fn((model: string) => meshModelImpl(model));
mock.module('./queue-tool-model', { namedExports: { isAudioModel, isMeshModel } });

function fakeResult(overrides: Partial<EnsureMediaWorkflowResult> = {}): EnsureMediaWorkflowResult {
  return {
    created: false,
    assigned: true,
    workflow: { id: 'wf-1', name: 'Audio scaffold' } as EnsureMediaWorkflowResult['workflow'],
    model: 'audio-model' as EnsureMediaWorkflowResult['model'],
    sharedPatch: { audioModel: 'audio-model' } as EnsureMediaWorkflowResult['sharedPatch'],
    note: '',
    ...overrides,
  };
}

let audioScaffoldImpl: (model?: unknown, options?: unknown) => EnsureMediaWorkflowResult = () =>
  fakeResult();
let meshScaffoldImpl: (model?: unknown, options?: unknown) => EnsureMediaWorkflowResult = () =>
  fakeResult({ model: 'mesh-model' as EnsureMediaWorkflowResult['model'] });
const ensureAudioWorkflowScaffold = mock.fn((model?: unknown, options?: unknown) =>
  audioScaffoldImpl(model, options)
);
const ensureMeshWorkflowScaffold = mock.fn((model?: unknown, options?: unknown) =>
  meshScaffoldImpl(model, options)
);
mock.module('./ensure-media-workflow', {
  namedExports: { ensureAudioWorkflowScaffold, ensureMeshWorkflowScaffold },
});

function resetMocks() {
  for (const m of [
    fetchComfyObjectInfoCached,
    isAudioModel,
    isMeshModel,
    ensureAudioWorkflowScaffold,
    ensureMeshWorkflowScaffold,
  ]) {
    m.mock.resetCalls();
  }
  objectInfoImpl = async () => ({ models: [] });
  audioModelImpl = () => true;
  meshModelImpl = () => true;
  audioScaffoldImpl = () => fakeResult();
  meshScaffoldImpl = () => fakeResult({ model: 'mesh-model' as EnsureMediaWorkflowResult['model'] });
}

afterEach(resetMocks);

describe('pin-media-weights', async () => {
  const { pinMediaWeightsAfterInstall } = await import('./pin-media-weights');

  it('returns a generic note without touching object info when kind=audio and the model is not an audio model', async () => {
    audioModelImpl = () => false;
    const result = await pinMediaWeightsAfterInstall('audio', 'not-audio');
    assert.deepEqual(result, { note: 'Installed weights. Refresh ComfyUI if loaders stay empty.' });
    assert.equal(fetchComfyObjectInfoCached.mock.calls.length, 0);
    assert.equal(ensureAudioWorkflowScaffold.mock.calls.length, 0);
  });

  it('returns a generic note when kind=mesh and the model is not a mesh model', async () => {
    meshModelImpl = () => false;
    const result = await pinMediaWeightsAfterInstall('mesh', 'not-mesh');
    assert.deepEqual(result, { note: 'Installed weights. Refresh ComfyUI if loaders stay empty.' });
    assert.equal(ensureMeshWorkflowScaffold.mock.calls.length, 0);
  });

  it('refreshes object info and returns the created-scaffold note for an audio model', async () => {
    audioScaffoldImpl = () => fakeResult({ created: true, model: 'audio-1' as EnsureMediaWorkflowResult['model'] });
    const result = await pinMediaWeightsAfterInstall('audio', 'audio-1');
    assert.equal(fetchComfyObjectInfoCached.mock.calls.length, 1);
    assert.deepEqual(fetchComfyObjectInfoCached.mock.calls[0]!.arguments[0], { forceRefresh: true });
    assert.ok(result.note.includes('Mapped audio-1 and created a audio scaffold'));
    assert.deepEqual(result.sharedPatch, { audioModel: 'audio-model' });
  });

  it('returns the mapped-to-existing-workflow note when the scaffold was not newly created', async () => {
    audioScaffoldImpl = () =>
      fakeResult({
        created: false,
        model: 'audio-1' as EnsureMediaWorkflowResult['model'],
        workflow: { id: 'wf-1', name: 'My Audio WF' } as EnsureMediaWorkflowResult['workflow'],
      });
    const result = await pinMediaWeightsAfterInstall('audio', 'audio-1');
    assert.ok(result.note.includes('Mapped audio-1 → workflow “My Audio WF”'));
  });

  it('tolerates fetchComfyObjectInfoCached rejecting (swallowed via .catch)', async () => {
    objectInfoImpl = async () => {
      throw new Error('network down');
    };
    const result = await pinMediaWeightsAfterInstall('mesh', 'mesh-1');
    assert.ok(result.note.includes('Mapped'));
    assert.equal(ensureMeshWorkflowScaffold.mock.calls.length, 1);
  });

  it('routes kind=mesh to ensureMeshWorkflowScaffold, not the audio scaffold', async () => {
    await pinMediaWeightsAfterInstall('mesh', 'mesh-1');
    assert.equal(ensureMeshWorkflowScaffold.mock.calls.length, 1);
    assert.equal(ensureAudioWorkflowScaffold.mock.calls.length, 0);
  });
});
