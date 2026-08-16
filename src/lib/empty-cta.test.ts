import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIRST_RUN_GENERATE_HREF } from './empty-cta';

describe('empty-cta', () => {
  it('sends first-run Generate to random surprise', () => {
    assert.equal(FIRST_RUN_GENERATE_HREF, '/?source=random');
  });
});
