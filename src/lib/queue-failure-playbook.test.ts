import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveQueueFailureHref, resolveQueueFailurePlaybook } from './queue-failure-playbook';

describe('resolveQueueFailureHref', () => {
  it('routes missing custom nodes to workflow map', () => {
    const href = resolveQueueFailureHref(
      'Workflow node type “FooBar” is not installed in ComfyUI — install the custom node pack.'
    );
    assert.ok(href);
    assert.match(href!, /workflow-map|comfyui/i);
  });

  it('routes LoRA and loader issues', () => {
    assert.match(resolveQueueFailureHref('LoRA stack invalid') ?? '', /lora/i);
    assert.match(resolveQueueFailureHref('checkpoint filename missing') ?? '', /model-assets|comfyui/i);
  });

  it('routes Diffusers, batch, object_info, and OOM failures', () => {
    assert.match(
      resolveQueueFailureHref('Diffusers queue failed: connection refused') ?? '',
      /inference-engine|comfyui/i
    );
    assert.equal(resolveQueueFailureHref('Batch queued with 2 failure(s)'), '/queue');
    assert.match(
      resolveQueueFailureHref('object_info missing node type FooBar') ?? '',
      /workflow-map|comfyui/i
    );
    assert.match(resolveQueueFailureHref('CUDA out of memory') ?? '', /vram|comfyui/i);
    assert.match(resolveQueueFailureHref('ComfyUI unauthorized 401') ?? '', /connection|comfyui/i);
  });

  it('routes stuck polls, empty outputs, and half-healed hosts', () => {
    assert.equal(
      resolveQueueFailureHref(
        'Timed out waiting for ComfyUI — open Queue to claim orphans or import history'
      ),
      '/queue'
    );
    assert.equal(resolveQueueFailureHref('Job finished — waiting for output files…'), '/queue');
    assert.match(
      resolveQueueFailureHref(
        'Could not read object_info from http://127.0.0.1:8188 — still booting'
      ) ?? '',
      /overview|settings/i
    );
    assert.match(
      resolveQueueFailureHref('ComfyUI restart requested; host did not answer in time') ?? '',
      /overview|settings/i
    );
  });

  it('returns undefined for generic failures', () => {
    assert.equal(resolveQueueFailureHref('Something went wrong'), undefined);
  });
});

describe('resolveQueueFailurePlaybook', () => {
  it('prefers structured issue href over regex', () => {
    const playbook = resolveQueueFailurePlaybook([
      {
        severity: 'error',
        message: 'Workflow node type “X” is not installed in ComfyUI',
        href: '/settings?tab=comfyui&section=workflow-map',
      },
    ]);
    assert.equal(playbook.href, '/settings?tab=comfyui&section=workflow-map');
    assert.match(playbook.message, /not installed/i);
  });
});
