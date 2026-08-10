import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeCollabDraftFields,
  resolveCollabFieldValue,
  type CollabDraftPayload,
} from './collab-presence';

describe('resolveCollabFieldValue', () => {
  it('prefers structured fields over legacy draft text', () => {
    const payload: CollabDraftPayload = {
      projectId: 'p1',
      peerId: 'peer-a',
      draft: 'legacy whole draft',
      fields: { hints: 'structured hints' },
      updatedAt: Date.now(),
    };
    assert.equal(resolveCollabFieldValue(payload, 'hints'), 'structured hints');
  });

  it('falls back to legacy draft for hint-like fields', () => {
    const payload: CollabDraftPayload = {
      projectId: 'p1',
      peerId: 'peer-a',
      draft: 'legacy hints',
      updatedAt: Date.now(),
    };
    assert.equal(resolveCollabFieldValue(payload, 'hints'), 'legacy hints');
  });
});

describe('mergeCollabDraftFields', () => {
  it('layers patches without dropping untouched keys', () => {
    assert.deepEqual(
      mergeCollabDraftFields({ hints: 'a', model: 'flux' }, { hints: 'b' }),
      { hints: 'b', model: 'flux' }
    );
  });
});
