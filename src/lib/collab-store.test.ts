import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { getCollabRoom, updateCollabRoom } from './collab-store';

describe('collab-store', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-collab-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (previousDataDir) {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    } else {
      delete process.env.PROMPT_DATA_DIR;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists draft updates to PROMPT_DATA_DIR/collab-rooms.json', async () => {
    await updateCollabRoom('project-a', current => ({
      ...current,
      draft: {
        projectId: 'project-a',
        peerId: 'peer-1',
        draft: 'hello world',
        updatedAt: Date.now(),
      },
    }));

    const filePath = path.join(tempDir, 'collab-rooms.json');
    assert.equal(fs.existsSync(filePath), true);
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      'project-a'?: { draft?: { draft?: string } };
    };
    assert.equal(stored['project-a']?.draft?.draft, 'hello world');
  });
});
