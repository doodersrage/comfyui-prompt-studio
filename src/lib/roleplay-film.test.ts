import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isGalleryClipEntry,
  lastRoleplayMotionSource,
  looksLikeVideoUrl,
  nextRoleplayMotionKind,
  normalizeRoleplayBeatOutput,
  shouldAutoQueueRoleplayClip,
} from './roleplay-film';
import type { RoleplayStoryBeat } from './roleplay';

describe('roleplay-film', () => {
  it('defaults beat output to clip', () => {
    assert.equal(normalizeRoleplayBeatOutput(undefined), 'clip');
    assert.equal(normalizeRoleplayBeatOutput('still'), 'still');
  });

  it('extends when the parent is already a clip', () => {
    assert.equal(nextRoleplayMotionKind({ derivedKind: 'i2v', tool: 'video' }), 'extend');
    assert.equal(nextRoleplayMotionKind({ tool: 'character' }), 'i2v');
  });

  it('prefers a completed clip over the still for the next init frame', () => {
    const story: RoleplayStoryBeat[] = [
      {
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        promptId: 'still-1',
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
        clipPromptId: 'clip-1',
        clipUrl: 'http://local/clip.mp4',
        clipStatus: 'completed',
      },
    ];
    const source = lastRoleplayMotionSource(story);
    assert.equal(source?.fromClip, true);
    assert.equal(source?.imageUrl, 'http://local/clip.mp4');
    assert.equal(source?.parentPromptId, 'clip-1');
  });

  it('auto-queues a clip once the still lands', () => {
    assert.equal(
      shouldAutoQueueRoleplayClip({
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
      }),
      true
    );
    assert.equal(
      shouldAutoQueueRoleplayClip({
        id: 'a',
        title: 'Dock',
        blurb: 'Arrives',
        at: 1,
        imageUrl: 'http://local/still.png',
        stillStatus: 'completed',
        clipPromptId: 'clip-1',
      }),
      false
    );
  });

  it('treats mp4 and i2v/extend entries as clips', () => {
    assert.equal(looksLikeVideoUrl('http://local/clip.mp4'), true);
    assert.equal(looksLikeVideoUrl('http://local/still.png'), false);
    assert.equal(isGalleryClipEntry({ derivedKind: 'extend', tool: 'video' }), true);
    assert.equal(isGalleryClipEntry({ tool: 'character', mediaKind: 'image' }), false);
  });
});
