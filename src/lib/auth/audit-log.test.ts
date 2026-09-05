import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { AuditLogEntry } from './audit-log';

let stored: AuditLogEntry[] = [];
const loadAuditLog = mock.fn((): AuditLogEntry[] => stored);
const saveAuditLog = mock.fn((entries: AuditLogEntry[]) => {
  stored = entries;
});
mock.module('@/lib/sqlite/tables', { namedExports: { loadAuditLog, saveAuditLog } });

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'seed-id',
    at: 0,
    actorUserId: 'user-1',
    actorUsername: 'alice',
    action: 'login',
    ...overrides,
  };
}

describe('auth/audit-log', async () => {
  const { appendAuditLog, listAuditLog } = await import('./audit-log');

  describe('appendAuditLog', () => {
    it('prepends a new entry with generated id and at fields', () => {
      stored = [];
      loadAuditLog.mock.resetCalls();
      saveAuditLog.mock.resetCalls();

      appendAuditLog({
        actorUserId: 'user-1',
        actorUsername: 'alice',
        action: 'login',
      });

      assert.equal(loadAuditLog.mock.callCount(), 1);
      assert.equal(saveAuditLog.mock.callCount(), 1);

      const saved = saveAuditLog.mock.calls[0].arguments[0] as AuditLogEntry[];
      assert.equal(saved.length, 1);
      assert.equal(saved[0].actorUserId, 'user-1');
      assert.equal(saved[0].actorUsername, 'alice');
      assert.equal(saved[0].action, 'login');
      assert.equal(typeof saved[0].id, 'string');
      assert.ok(saved[0].id.length > 0);
      assert.equal(typeof saved[0].at, 'number');
    });

    it('prepends onto the existing entries returned by loadAuditLog', () => {
      const existing = makeEntry({ id: 'old-1', action: 'existing' });
      stored = [existing];

      appendAuditLog({
        actorUserId: 'user-2',
        actorUsername: 'bob',
        action: 'logout',
      });

      const saved = saveAuditLog.mock.calls.at(-1)!.arguments[0] as AuditLogEntry[];
      assert.equal(saved.length, 2);
      assert.equal(saved[0].action, 'logout');
      assert.equal(saved[1].id, 'old-1');
    });

    it('passes optional target and details through untouched', () => {
      stored = [];
      appendAuditLog({
        actorUserId: 'user-1',
        actorUsername: 'alice',
        action: 'delete',
        target: 'project-42',
        details: 'removed via UI',
      });

      const saved = saveAuditLog.mock.calls.at(-1)!.arguments[0] as AuditLogEntry[];
      assert.equal(saved[0].target, 'project-42');
      assert.equal(saved[0].details, 'removed via UI');
    });

    it('caps the saved list at 500 entries, dropping the oldest', () => {
      stored = Array.from({ length: 500 }, (_, index) =>
        makeEntry({ id: `existing-${index}`, action: 'existing' })
      );

      appendAuditLog({
        actorUserId: 'user-1',
        actorUsername: 'alice',
        action: 'newest',
      });

      const saved = saveAuditLog.mock.calls.at(-1)!.arguments[0] as AuditLogEntry[];
      assert.equal(saved.length, 500);
      assert.equal(saved[0].action, 'newest');
      assert.equal(
        saved.some(entry => entry.id === 'existing-499'),
        false,
        'the oldest entry should have been dropped'
      );
    });

    it('generates distinct ids for entries appended in quick succession', () => {
      stored = [];
      appendAuditLog({ actorUserId: 'u', actorUsername: 'u', action: 'a' });
      const firstSaved = saveAuditLog.mock.calls.at(-1)!.arguments[0] as AuditLogEntry[];
      stored = firstSaved;

      appendAuditLog({ actorUserId: 'u', actorUsername: 'u', action: 'b' });
      const secondSaved = saveAuditLog.mock.calls.at(-1)!.arguments[0] as AuditLogEntry[];

      assert.notEqual(secondSaved[0].id, secondSaved[1].id);
    });
  });

  describe('listAuditLog', () => {
    it('returns all entries when there are fewer than the limit', () => {
      stored = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
      const result = listAuditLog();
      assert.equal(result.length, 2);
      assert.deepEqual(result, stored);
    });

    it('defaults to a limit of 100', () => {
      stored = Array.from({ length: 150 }, (_, index) => makeEntry({ id: `entry-${index}` }));
      const result = listAuditLog();
      assert.equal(result.length, 100);
      assert.equal(result[0].id, 'entry-0');
      assert.equal(result[99].id, 'entry-99');
    });

    it('respects a custom limit', () => {
      stored = Array.from({ length: 10 }, (_, index) => makeEntry({ id: `entry-${index}` }));
      const result = listAuditLog(3);
      assert.equal(result.length, 3);
      assert.deepEqual(
        result.map(entry => entry.id),
        ['entry-0', 'entry-1', 'entry-2']
      );
    });

    it('returns an empty array when nothing has been stored', () => {
      stored = [];
      assert.deepEqual(listAuditLog(), []);
    });

    it('returns an empty array when limit is 0', () => {
      stored = [makeEntry({ id: 'a' })];
      assert.deepEqual(listAuditLog(0), []);
    });
  });
});
