import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  engineDisplayName,
  engineUsesComfyGraph,
  isCloudEngine,
  normalizeEngineId,
  parseEngineId,
} from './engine/capabilities';
import {
  encodeFalPromptId,
  falModelToSubfolder,
  falSubfolderToModel,
  isAllowedFalMediaUrl,
  mapFalQueueStatus,
  parseFalPromptId,
  sanitizeFalModelId,
} from './fal-protocol';

describe('engine capabilities', () => {
  it('parses known engine ids and defaults the rest to ComfyUI', () => {
    assert.equal(parseEngineId('fal'), 'fal');
    assert.equal(parseEngineId('replicate'), 'replicate');
    assert.equal(parseEngineId('diffusers'), 'diffusers');
    assert.equal(parseEngineId('nope'), undefined);
    assert.equal(normalizeEngineId('fal'), 'fal');
    assert.equal(normalizeEngineId('replicate'), 'replicate');
    assert.equal(normalizeEngineId(''), 'comfyui');
  });

  it('treats Fal and Replicate as cloud engines without a Comfy graph', () => {
    assert.equal(isCloudEngine('fal'), true);
    assert.equal(isCloudEngine('replicate'), true);
    assert.equal(isCloudEngine('comfyui'), false);
    assert.equal(engineUsesComfyGraph('fal'), false);
    assert.equal(engineUsesComfyGraph('replicate'), false);
    assert.equal(engineUsesComfyGraph('diffusers'), true);
    assert.equal(engineDisplayName('fal'), 'Fal');
    assert.equal(engineDisplayName('replicate'), 'Replicate');
  });
});

describe('fal protocol', () => {
  it('round-trips model id and request id through the studio prompt id', () => {
    const promptId = encodeFalPromptId('fal-ai/flux/schnell', 'req_ab12CD34ef');
    assert.deepEqual(parseFalPromptId(promptId), {
      modelId: 'fal-ai/flux/schnell',
      requestId: 'req_ab12CD34ef',
    });
  });

  it('rejects unsafe model ids and prompt ids', () => {
    assert.throws(() => sanitizeFalModelId('../etc/passwd', 'fal-ai/flux/schnell'));
    assert.equal(sanitizeFalModelId(' fal-ai/flux/dev ', 'fal-ai/flux/schnell'), 'fal-ai/flux/dev');
    assert.equal(parseFalPromptId('not-a-fal-id'), null);
    assert.equal(parseFalPromptId('fal-ai/flux/schnell::bad id'), null);
  });

  it('encodes model paths as gallery subfolders', () => {
    assert.equal(falModelToSubfolder('fal-ai/flux/dev/image-to-image'), 'fal-ai--flux--dev--image-to-image');
    assert.equal(
      falSubfolderToModel('fal-ai--flux--dev--image-to-image'),
      'fal-ai/flux/dev/image-to-image'
    );
  });

  it('maps Fal queue statuses onto studio job states', () => {
    assert.equal(mapFalQueueStatus('IN_QUEUE'), 'pending');
    assert.equal(mapFalQueueStatus('IN_PROGRESS'), 'running');
    assert.equal(mapFalQueueStatus('COMPLETED'), 'completed');
    assert.equal(mapFalQueueStatus('FAILED'), 'error');
  });

  it('only fetches result pixels from Fal media hosts', () => {
    assert.equal(isAllowedFalMediaUrl('https://v3.fal.media/files/out.png'), true);
    assert.equal(isAllowedFalMediaUrl('https://fal.media/x.jpg'), true);
    assert.equal(isAllowedFalMediaUrl('https://evil.example/x.png'), false);
    assert.equal(isAllowedFalMediaUrl('http://fal.media/x.png'), false);
  });
});
