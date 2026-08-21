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

    it('round-trips similar, duplicates, vision inbox, user tag, and custom group params', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: {
        semanticSearch: true,
        similarToEntryId: 'entry-9',
        similarMode: 'visual',
        duplicatesOnly: true,
        needsVisionReview: true,
        userTag: 'keeper',
        customGroup: 'Look A',
        derivedKind: 'film',
        characterId: 'char-rin',
        visionTagsOnly: true,
      },
      sort: 'eviction-risk-desc',
      projectFilterId: '',
    });
    const parsed = parseGalleryUrlState(params);
    assert.equal(parsed.filter.semanticSearch, true);
    assert.equal(parsed.filter.similarToEntryId, 'entry-9');
    assert.equal(parsed.filter.similarMode, 'visual');
    assert.equal(parsed.filter.duplicatesOnly, true);
    assert.equal(parsed.filter.needsVisionReview, true);
    assert.equal(parsed.filter.userTag, 'keeper');
    assert.equal(parsed.filter.customGroup, 'Look A');
    assert.equal(parsed.filter.derivedKind, 'film');
    assert.equal(parsed.filter.characterId, 'char-rin');
    assert.equal(parsed.filter.visionTagsOnly, true);
    assert.equal(parsed.sort, 'eviction-risk-desc');
  });

  it('round-trips audio and mesh media filters', () => {
    const params = new URLSearchParams();
    applyGalleryUrlState(params, {
      filter: { mediaKind: 'audio' },
      sort: 'queued-desc',
      projectFilterId: '',
    });
    assert.equal(parseGalleryUrlState(params).filter.mediaKind, 'audio');
    applyGalleryUrlState(params, {
      filter: { mediaKind: 'mesh' },
      sort: 'queued-desc',
      projectFilterId: '',
    });
    assert.equal(parseGalleryUrlState(params).filter.mediaKind, 'mesh');
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
