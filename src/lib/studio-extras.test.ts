import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  foldLegacyNamespacesIntoExtras,
  mergeStudioExtras,
  type StudioExtrasPayload,
} from './studio-extras';

describe('studio-extras merge', () => {
  it('prefers the newer updatedAt snapshot', () => {
    const older: StudioExtrasPayload = {
      updatedAt: 100,
      avoidedTokens: ['old'],
      navFavorites: ['/old'],
    };
    const newer: StudioExtrasPayload = {
      updatedAt: 200,
      avoidedTokens: ['new'],
      navFavorites: ['/new'],
    };
    assert.deepEqual(mergeStudioExtras(older, newer).avoidedTokens, ['new']);
    assert.deepEqual(mergeStudioExtras(newer, older).avoidedTokens, ['new']);
  });

  it('keeps local on equal timestamps', () => {
    const local: StudioExtrasPayload = {
      updatedAt: 50,
      avoidedTokens: ['local'],
    };
    const server: StudioExtrasPayload = {
      updatedAt: 50,
      avoidedTokens: ['server'],
    };
    assert.deepEqual(mergeStudioExtras(local, server).avoidedTokens, ['local']);
  });

  it('folds legacy namespaces into missing extras fields', () => {
    const folded = foldLegacyNamespacesIntoExtras(
      { updatedAt: 1, avoidedTokens: [] },
      {
        avoidedTokens: ['blurry'],
        scheduledBatch: { enabled: true } as never,
        webhookSettings: { enabled: false } as never,
        promptProjects: [{ id: 'p1' }],
      }
    );
    assert.deepEqual(folded.avoidedTokens, ['blurry']);
    assert.equal((folded.scheduledBatch as { enabled?: boolean })?.enabled, true);
    assert.equal((folded.webhookSettings as { enabled?: boolean })?.enabled, false);
    assert.equal(folded.promptProjects?.length, 1);
  });
});
