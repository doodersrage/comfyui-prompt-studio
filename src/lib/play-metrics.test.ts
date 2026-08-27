import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  daysFromCampaignStartToFirstFilmCut,
  firstFilmCutWithinDays,
  type PlayMetrics,
} from './play-metrics';

describe('play-metrics', () => {
  it('computes days from campaign start to first film cut', () => {
    const day = 1000 * 60 * 60 * 24;
    const metrics: PlayMetrics = {
      version: 1,
      firstPlayCampaignAt: 1_000_000,
      firstFilmCutAt: 1_000_000 + day * 2,
    };
    assert.equal(daysFromCampaignStartToFirstFilmCut(metrics), 2);
    assert.equal(firstFilmCutWithinDays(3, metrics), true);
    assert.equal(firstFilmCutWithinDays(1, metrics), false);
  });

  it('returns null when funnel timestamps are incomplete', () => {
    assert.equal(daysFromCampaignStartToFirstFilmCut({ version: 1 }), null);
    assert.equal(
      firstFilmCutWithinDays(7, { version: 1, firstPlayCampaignAt: Date.now() }),
      null
    );
  });
});
