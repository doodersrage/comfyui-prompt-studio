import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyGalleryUrlState, parseGalleryUrlState } from './gallery-url-state';

describe('gallery-url-state', () => {
  it('round-trips filter and sort params', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: {
        status: 'completed',
        model: 'flux.safetensors',
        minRating: 4,
        favoritesOnly: true,
        atRiskOnly: true,
        query: 'portrait',
      },
      sort: 'rating-desc',
      projectFilterId: 'proj-1',
    });

    const parsed = parseGalleryUrlState(params);
    assert.equal(parsed.filter.status, 'completed');
    assert.equal(parsed.filter.model, 'flux.safetensors');
    assert.equal(parsed.filter.minRating, 4);
    assert.equal(parsed.filter.favoritesOnly, true);
    assert.equal(parsed.filter.atRiskOnly, true);
    assert.equal(parsed.filter.query, 'portrait');
    assert.equal(parsed.sort, 'rating-desc');
    assert.equal(parsed.projectFilterId, 'proj-1');
  });

  it('preserves unrelated params when applying state', () => {
    const params = new URLSearchParams('lightbox=abc&pickFor=compose');
    applyGalleryUrlState(params, {
      filter: { status: 'error' },
      sort: 'queued-desc',
      projectFilterId: '',
    });
    assert.equal(params.get('lightbox'), 'abc');
    assert.equal(params.get('pickFor'), 'compose');
    assert.equal(params.get('status'), 'error');
    assert.equal(params.get('sort'), null);
  });
});
