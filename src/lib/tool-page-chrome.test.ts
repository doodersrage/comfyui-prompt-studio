import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TOOL_SETUP_LABELS,
  TOOL_SIDEBAR_DESCRIPTION,
  TOOL_SIDEBAR_TITLE,
  descriptionForWorkspace,
} from './tool-page-chrome';

describe('tool-page-chrome', () => {
  it('exposes shared sidebar defaults', () => {
    assert.equal(TOOL_SIDEBAR_TITLE, 'Settings');
    assert.match(TOOL_SIDEBAR_DESCRIPTION, /Advanced/);
  });

  it('picks simple descriptions in simple workspace', () => {
    assert.equal(descriptionForWorkspace('simple', 'Full copy', 'Short copy'), 'Short copy');
    assert.equal(descriptionForWorkspace('studio', 'Full copy', 'Short copy'), 'Full copy');
    assert.equal(descriptionForWorkspace('full', 'Full copy', 'Short copy'), 'Full copy');
  });

  it('aligns setup banner labels with nav names', () => {
    assert.equal(TOOL_SETUP_LABELS.format, 'Format');
    assert.equal(TOOL_SETUP_LABELS.topics, 'Topics');
    assert.equal(TOOL_SETUP_LABELS.imagePrompt, 'Image → Prompt');
  });
});
