import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
} from './fitting-room';

describe('fitting-room swipe deck', () => {
  const options = [
    { value: '', label: 'Pick a kit…' },
    { value: 'kit-a', label: 'Linen set', group: 'Outfit' },
    { value: 'kit-b', label: 'Rain coat', group: 'Outerwear' },
    { value: 'kit-c', label: 'Evening gown', group: 'Outfit' },
  ];

  it('buildFittingSwipeDeck drops empty values and prefers outfit + preferred id', () => {
    const deck = buildFittingSwipeDeck(options, 'kit-b', 8);
    assert.equal(deck.length, 3);
    assert.equal(deck[0]?.id, 'kit-b');
    assert.ok(deck.some(kit => kit.id === 'kit-a'));
  });

  it('fittingSwipeNeighbor wraps around the deck', () => {
    const deck = buildFittingSwipeDeck(options, 'kit-a');
    const next = fittingSwipeNeighbor(deck, 'kit-a', 1);
    const prev = fittingSwipeNeighbor(deck, 'kit-a', -1);
    assert.ok(next);
    assert.ok(prev);
    assert.notEqual(next!.id, 'kit-a');
    assert.equal(fittingSwipeIndex(deck, next!.id) >= 0, true);
  });
});
