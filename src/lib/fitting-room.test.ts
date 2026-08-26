import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFittingKitPreviewPrompt,
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  resolveFittingDeckWardrobeId,
  resolveFittingKitPreviewPlate,
} from './fitting-room';

describe('fitting-room swipe deck', () => {
  const options = [
    { value: '', label: 'Pick a kit…' },
    { value: 'kit-a', label: 'Linen set', group: 'Outfit' },
    { value: 'kit-b', label: 'Rain coat', group: 'Outerwear' },
    { value: 'kit-c', label: 'Evening gown', group: 'Outfit' },
  ];

  it('buildFittingSwipeDeck drops empty values and sorts outfits before other groups', () => {
    const deck = buildFittingSwipeDeck(options, 8);
    assert.equal(deck.length, 3);
    assert.equal(deck[0]?.id, 'kit-c');
    assert.equal(deck[1]?.id, 'kit-a');
    assert.equal(deck[2]?.id, 'kit-b');
  });

  it('buildFittingSwipeDeck returns all kits when no limit is passed', () => {
    const many = [
      { value: '', label: 'Pick a kit…' },
      ...Array.from({ length: 40 }, (_, index) => ({
        value: `kit-${index}`,
        label: `Kit ${index}`,
        group: index % 2 === 0 ? 'Outfit' : 'Other',
      })),
    ];
    const deck = buildFittingSwipeDeck(many);
    assert.equal(deck.length, 40);
  });

  it('fittingSwipeNeighbor wraps around the deck', () => {
    const deck = buildFittingSwipeDeck(options);
    const next = fittingSwipeNeighbor(deck, 'kit-a', 1);
    const prev = fittingSwipeNeighbor(deck, 'kit-a', -1);
    assert.ok(next);
    assert.ok(prev);
    assert.notEqual(next!.id, 'kit-a');
    assert.equal(fittingSwipeIndex(deck, next!.id) >= 0, true);
  });

  it('fittingSwipeIndex returns -1 when id is missing from deck', () => {
    const deck = buildFittingSwipeDeck(options);
    assert.equal(fittingSwipeIndex(deck, 'missing'), -1);
    assert.equal(fittingSwipeIndex(deck, ''), -1);
  });

  it('resolveFittingDeckWardrobeId falls back to first deck kit', () => {
    const deck = buildFittingSwipeDeck(options);
    assert.equal(resolveFittingDeckWardrobeId(deck, 'missing'), 'kit-c');
    assert.equal(resolveFittingDeckWardrobeId(deck, 'kit-b'), 'kit-b');
  });

  it('fittingSwipeNeighbor uses deck fallback when lock is outside deck', () => {
    const deck = buildFittingSwipeDeck(options);
    const next = fittingSwipeNeighbor(deck, 'missing-outside', 1);
    assert.ok(next);
    assert.equal(next!.id, deck[1]?.id);
  });
});

describe('fitting outfit prompts', () => {
  it('buildFittingKitPreviewPrompt omits character flavor and forbids props', () => {
    const prompt = buildFittingKitPreviewPrompt({ outfitLabel: 'Silver two-piece swimsuit' });
    assert.match(prompt, /Silver two-piece swimsuit/);
    assert.match(prompt, /Replace all clothing/i);
    assert.match(prompt, /Remove every garment, weapon/i);
    assert.match(prompt, /white studio/i);
    assert.match(prompt, /SOLO SUBJECT/i);
    assert.match(prompt, /One person only/i);
    assert.doesNotMatch(prompt, /look notes/i);
  });

  it('resolveFittingKitPreviewPlate uses cached preview sidecar when source matches', () => {
    const plate = resolveFittingKitPreviewPlate({
      previewPlateFilename: 'white.png',
      previewPlateUrl: 'https://example.com/white.png',
      previewPlateSourceKey: 'scene.png|orig.png',
      sourceKey: 'scene.png|orig.png',
    });
    assert.deepEqual(plate, { filename: 'white.png', imageUrl: 'https://example.com/white.png' });
  });

  it('resolveFittingKitPreviewPlate ignores stale sidecar keys', () => {
    assert.equal(
      resolveFittingKitPreviewPlate({
        previewPlateFilename: 'white.png',
        previewPlateSourceKey: 'old-key',
        sourceKey: 'new-key',
      }),
      null
    );
  });
});
