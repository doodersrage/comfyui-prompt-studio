import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveQueueFailureHref } from './queue-failure-playbook';

describe('resolveQueueFailureHref', () => {
  it('routes missing custom nodes to workflow map', () => {
    const href = resolveQueueFailureHref(
      'Workflow node type “FooBar” is not installed in ComfyUI — install the custom node pack.'
    );
    assert.ok(href);
    assert.match(href!, /workflow-map|comfyui/i);
  });

  it('returns undefined for generic failures', () => {
    assert.equal(resolveQueueFailureHref('Something went wrong'), undefined);
  });
});
