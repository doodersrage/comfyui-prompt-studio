import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GALLERY_DERIVED_KIND_FILTERS,
  galleryDerivedKindChipLabel,
  galleryDerivedKindLabel,
} from './gallery-derived-kind';

describe('gallery-derived-kind', () => {
  it('labels ControlNet and face-detail derivatives', () => {
    assert.match(galleryDerivedKindLabel('controlnet') ?? '', /ControlNet/i);
    assert.match(galleryDerivedKindLabel('face-detail') ?? '', /face/i);
    assert.match(galleryDerivedKindChipLabel('soft-pass'), /Soft/i);
  });

  it('exposes the full filter set', () => {
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('controlnet'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('face-detail'));
    assert.ok(GALLERY_DERIVED_KIND_FILTERS.includes('i2v'));
    assert.match(galleryDerivedKindLabel('i2v') ?? '', /animated/i);
    assert.equal(galleryDerivedKindChipLabel('i2v'), 'I2V');
  });
});
