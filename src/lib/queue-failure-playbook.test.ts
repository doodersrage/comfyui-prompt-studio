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
