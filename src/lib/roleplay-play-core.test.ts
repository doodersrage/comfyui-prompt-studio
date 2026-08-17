import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from './isolate-subject';
import { buildRoleplayQueueStillOptions, buildRoleplayRequestBody } from './roleplay-play-core';
import { DEFAULT_SHARED_SETTINGS } from './settings-cache';

describe('roleplay-play-core', () => {
  it('omits still identity options when not in photo mode', () => {
    assert.equal(
      buildRoleplayQueueStillOptions({
        photoMode: false,
        isolateSubject: false,
        referenceIsolated: false,
        filename: 'face.png',
        imageUrl: '/media/face.png',
      }),
      undefined,
    );
  });

  it('locks identity from the reference still in photo mode', () => {
    const options = buildRoleplayQueueStillOptions({
      photoMode: true,
      isolateSubject: false,
      referenceIsolated: false,
      filename: 'face.png',
      imageUrl: '/media/face.png',
      identityLockStrength: 0.7,
      identityKind: 'ipadapter',
    });
    assert.deepEqual(options, {
      inputImageFilename: 'face.png',
      inputImageUrl: '/media/face.png',
      identityLock: true,
      identityLockStrength: 0.7,
      identityKind: 'ipadapter',
    });
  });

  it('blocks queue until isolate-on-white finishes', () => {
    assert.throws(
      () =>
        buildRoleplayQueueStillOptions({
          photoMode: true,
          isolateSubject: true,
          referenceIsolated: false,
          filename: 'face.png',
        }),
      (err: Error) => err.message === ISOLATE_QUEUE_BLOCKED_MESSAGE,
    );
  });

  it('builds a bio request without prior story', () => {
    const body = buildRoleplayRequestBody({
      action: 'bio',
      shared: DEFAULT_SHARED_SETTINGS,
      personaId: 'raccoon-pirate',
      tone: 'silly',
      content: 'pg13',
      hasReferenceImage: true,
      isolatedSubject: true,
      bio: { name: 'Rin', look: 'raccoon pirate', personality: 'chirpy' },
      story: [{ id: 'old', at: 1, title: 'Old', blurb: 'skip', prompt: 'skip' }],
    });
    assert.equal(body.action, 'bio');
    assert.equal(body.personaId, 'raccoon-pirate');
    assert.equal(body.bio, undefined);
    assert.deepEqual(body.story, []);
    assert.equal(body.hasReferenceImage, true);
    assert.equal(body.isolatedSubject, true);
  });
});
