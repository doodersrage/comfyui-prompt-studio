import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCampaignLookPackId } from './play-campaign';

describe('play campaign helpers', () => {
  it('resolveCampaignLookPackId prefers query over saved', () => {
    assert.equal(
      resolveCampaignLookPackId({ queryLookPackId: ' query ', savedLookPackId: 'saved' }),
      'query'
    );
  });

  it('resolveCampaignLookPackId falls back to saved id', () => {
    assert.equal(
      resolveCampaignLookPackId({ queryLookPackId: '', savedLookPackId: ' lp-resume ' }),
      'lp-resume'
    );
    assert.equal(resolveCampaignLookPackId({ savedLookPackId: 'lp-only' }), 'lp-only');
  });

  it('resolveCampaignLookPackId returns undefined when empty', () => {
    assert.equal(resolveCampaignLookPackId({}), undefined);
    assert.equal(resolveCampaignLookPackId({ queryLookPackId: '  ', savedLookPackId: '' }), undefined);
  });
});
