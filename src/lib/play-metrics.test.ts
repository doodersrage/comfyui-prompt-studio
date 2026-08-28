import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  daysFromCampaignStartToFirstFilmCut,
  firstFilmCutWithinDays,
  resolveNextPlayAction,
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

  it('resolves next Play action from funnel stalls', () => {
    assert.equal(resolveNextPlayAction({}).href, '/play');
    assert.equal(
      resolveNextPlayAction({ funnel: { firstPlayCampaign: 2, firstFilmCut: 0 } }).href,
      '/day'
    );
    assert.equal(
      resolveNextPlayAction({ funnel: { keepTryOn: 3, firstFilmCut: 0 } }).label,
      'Continue in Day'
    );
    assert.equal(
      resolveNextPlayAction({ funnel: { firstFilmCut: 1, saveToCast: 0 } }).href,
      '/characters'
    );
    const resume = resolveNextPlayAction({
      campaign: { characterId: 'c1', stepIndex: 2 },
    });
    assert.equal(resume.href, '/fitting?character=c1');
    assert.match(resume.label, /Fitting/i);
  });

  it('pushes Cast watch then another Day cut after campaign complete', () => {
    const watch = resolveNextPlayAction({
      funnel: { firstFilmCut: 1, saveToCast: 1 },
      campaign: { characterId: 'c1', stepIndex: 4, completedAt: Date.now() },
      watchedFirstFilm: false,
    });
    assert.equal(watch.label, 'Watch film on Cast');
    assert.equal(watch.href, '/characters/c1?media=films');

    const again = resolveNextPlayAction({
      funnel: { firstFilmCut: 1, saveToCast: 1 },
      campaign: { characterId: 'c1', stepIndex: 4, completedAt: Date.now() },
      watchedFirstFilm: true,
    });
    assert.equal(again.label, 'Cut another Day film');
    assert.equal(again.href, '/day?character=c1');
  });
});
