import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import {
  diffHistoryEntries,
  findIterationNodeById,
  listIterationEntries,
} from './iteration-branch-diff';
import { buildPromptIterationForest } from './prompt-iteration-tree';

function historyEntry(overrides: Partial<PromptHistoryEntry> & { id: string }): PromptHistoryEntry {
  return {
    tool: 'generate',
    prompt: 'a prompt',
    model: 'flux',
    timestamp: 0,
    ...overrides,
  };
}

describe('iteration-branch-diff', () => {
  describe('diffHistoryEntries', () => {
    it('diffs the prompt text of two entries and preserves left/right', () => {
      const left = historyEntry({ id: 'l', prompt: 'a red car' });
      const right = historyEntry({ id: 'r', prompt: 'a blue car' });
      const result = diffHistoryEntries(left, right);
      assert.equal(result.left, left);
      assert.equal(result.right, right);
      assert.equal(result.diff.changed, true);
      assert.ok(result.diff.segments.some(s => s.type === 'remove' && s.text === 'red'));
      assert.ok(result.diff.segments.some(s => s.type === 'add' && s.text === 'blue'));
    });
  });

  describe('findIterationNodeById', () => {
    it('finds a root node by id', () => {
      const root = historyEntry({ id: 'root', timestamp: 100 });
      const forest = buildPromptIterationForest([root]);
      const found = findIterationNodeById(forest, 'root');
      assert.equal(found?.entry.id, 'root');
    });

    it('finds a nested child node by id', () => {
      const root = historyEntry({ id: 'root', timestamp: 100 });
      const child = historyEntry({
        id: 'child',
        timestamp: 200,
        metadata: { parentHistoryId: 'root' },
      });
      const grandchild = historyEntry({
        id: 'grandchild',
        timestamp: 300,
        metadata: { parentHistoryId: 'child' },
      });
      const forest = buildPromptIterationForest([root, child, grandchild]);
      const found = findIterationNodeById(forest, 'grandchild');
      assert.equal(found?.entry.id, 'grandchild');
    });

    it('returns null when the id is not present anywhere in the forest', () => {
      const root = historyEntry({ id: 'root' });
      const forest = buildPromptIterationForest([root]);
      assert.equal(findIterationNodeById(forest, 'missing'), null);
    });

    it('returns null for an empty forest', () => {
      assert.equal(findIterationNodeById([], 'anything'), null);
    });
  });

  describe('listIterationEntries', () => {
    it('flattens a forest of roots and their children in parent-then-children order', () => {
      const root = historyEntry({ id: 'root', timestamp: 100 });
      const child = historyEntry({
        id: 'child',
        timestamp: 200,
        metadata: { parentHistoryId: 'root' },
      });
      const entries = listIterationEntries([root, child]);
      assert.deepEqual(
        entries.map(e => e.id),
        ['root', 'child']
      );
    });

    it('returns [] for an empty entries list', () => {
      assert.deepEqual(listIterationEntries([]), []);
    });
  });
});
