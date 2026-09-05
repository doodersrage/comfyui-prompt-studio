import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { RegisteredSession } from './session-registry';

let sessions: RegisteredSession[] = [];

const loadSessions = mock.fn((): RegisteredSession[] => sessions);
const trimSessions = mock.fn((_max: number) => {});
const upsertSession = mock.fn((session: RegisteredSession) => {
  const index = sessions.findIndex(entry => entry.id === session.id);
  if (index === -1) {
    sessions.push(session);
  } else {
    sessions[index] = session;
  }
});

mock.module('@/lib/sqlite/tables', {
  namedExports: { loadSessions, trimSessions, upsertSession },
});

function makeSession(overrides: Partial<RegisteredSession> = {}): RegisteredSession {
  return {
    id: 'sess-1',
    userId: 'u1',
    username: 'alice',
    createdAt: 100,
    lastSeenAt: 100,
    revoked: false,
    ...overrides,
  };
}

afterEach(() => {
  sessions = [];
  loadSessions.mock.resetCalls();
  trimSessions.mock.resetCalls();
  upsertSession.mock.resetCalls();
});

describe('auth/session-registry', async () => {
  const {
    registerSession,
    touchSession,
    listUserSessions,
    revokeSession,
    revokeAllUserSessions,
    isSessionRevoked,
  } = await import('./session-registry');

  describe('registerSession', () => {
    it('stores a new session with the given user info and returns a string id', () => {
      const id = registerSession({ userId: 'u1', username: 'alice' });
      assert.equal(typeof id, 'string');
      assert.ok(id.length > 0);
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0]!.id, id);
      assert.equal(sessions[0]!.userId, 'u1');
      assert.equal(sessions[0]!.username, 'alice');
      assert.equal(sessions[0]!.revoked, false);
      assert.equal(typeof sessions[0]!.createdAt, 'number');
      assert.equal(sessions[0]!.createdAt, sessions[0]!.lastSeenAt);
    });

    it('carries userAgent and ip through when provided', () => {
      registerSession({ userId: 'u1', username: 'alice', userAgent: 'ua-1', ip: '1.2.3.4' });
      assert.equal(sessions[0]!.userAgent, 'ua-1');
      assert.equal(sessions[0]!.ip, '1.2.3.4');
    });

    it('generates unique ids across calls', () => {
      const id1 = registerSession({ userId: 'u1', username: 'alice' });
      const id2 = registerSession({ userId: 'u1', username: 'alice' });
      assert.notEqual(id1, id2);
    });

    it('trims the session store after inserting', () => {
      registerSession({ userId: 'u1', username: 'alice' });
      assert.equal(trimSessions.mock.calls.length, 1);
      assert.equal(trimSessions.mock.calls[0]!.arguments[0], 500);
    });
  });

  describe('touchSession', () => {
    it('updates lastSeenAt for an existing, non-revoked session', () => {
      sessions = [makeSession({ id: 's1', lastSeenAt: 100 })];
      const before = Date.now();
      touchSession('s1');
      assert.equal(upsertSession.mock.calls.length, 1);
      const updated = sessions.find(s => s.id === 's1')!;
      assert.ok(updated.lastSeenAt >= before);
      assert.equal(updated.id, 's1');
    });

    it('does nothing for an unknown session id', () => {
      sessions = [makeSession({ id: 's1' })];
      touchSession('missing');
      assert.equal(upsertSession.mock.calls.length, 0);
    });

    it('does nothing for a revoked session', () => {
      sessions = [makeSession({ id: 's1', revoked: true })];
      touchSession('s1');
      assert.equal(upsertSession.mock.calls.length, 0);
    });
  });

  describe('listUserSessions', () => {
    it('returns only non-revoked sessions for the given user', () => {
      sessions = [
        makeSession({ id: 's1', userId: 'u1', revoked: false }),
        makeSession({ id: 's2', userId: 'u1', revoked: true }),
        makeSession({ id: 's3', userId: 'u2', revoked: false }),
      ];
      const result = listUserSessions('u1');
      assert.equal(result.length, 1);
      assert.equal(result[0]!.id, 's1');
    });

    it('returns an empty array when the user has no sessions', () => {
      sessions = [makeSession({ id: 's1', userId: 'u2' })];
      assert.deepEqual(listUserSessions('u1'), []);
    });
  });

  describe('revokeSession', () => {
    it('marks a matching session revoked and returns true', () => {
      sessions = [makeSession({ id: 's1', userId: 'u1', revoked: false })];
      const result = revokeSession('u1', 's1');
      assert.equal(result, true);
      assert.equal(sessions[0]!.revoked, true);
    });

    it('returns false when the session id does not exist', () => {
      sessions = [makeSession({ id: 's1', userId: 'u1' })];
      const result = revokeSession('u1', 'missing');
      assert.equal(result, false);
      assert.equal(upsertSession.mock.calls.length, 0);
    });

    it('returns false when the session belongs to a different user', () => {
      sessions = [makeSession({ id: 's1', userId: 'u1' })];
      const result = revokeSession('u2', 's1');
      assert.equal(result, false);
      assert.equal(sessions[0]!.revoked, false);
    });
  });

  describe('revokeAllUserSessions', () => {
    it('revokes all non-revoked sessions for the user and returns the count', () => {
      sessions = [
        makeSession({ id: 's1', userId: 'u1', revoked: false }),
        makeSession({ id: 's2', userId: 'u1', revoked: false }),
        makeSession({ id: 's3', userId: 'u2', revoked: false }),
      ];
      const count = revokeAllUserSessions('u1');
      assert.equal(count, 2);
      assert.equal(sessions.find(s => s.id === 's1')!.revoked, true);
      assert.equal(sessions.find(s => s.id === 's2')!.revoked, true);
      assert.equal(sessions.find(s => s.id === 's3')!.revoked, false);
    });

    it('skips already-revoked sessions', () => {
      sessions = [
        makeSession({ id: 's1', userId: 'u1', revoked: true }),
        makeSession({ id: 's2', userId: 'u1', revoked: false }),
      ];
      const count = revokeAllUserSessions('u1');
      assert.equal(count, 1);
    });

    it('excludes the exceptSessionId from being revoked', () => {
      sessions = [
        makeSession({ id: 's1', userId: 'u1', revoked: false }),
        makeSession({ id: 's2', userId: 'u1', revoked: false }),
      ];
      const count = revokeAllUserSessions('u1', 's1');
      assert.equal(count, 1);
      assert.equal(sessions.find(s => s.id === 's1')!.revoked, false);
      assert.equal(sessions.find(s => s.id === 's2')!.revoked, true);
    });

    it('returns 0 when the user has no sessions', () => {
      sessions = [makeSession({ id: 's1', userId: 'u2' })];
      assert.equal(revokeAllUserSessions('u1'), 0);
    });
  });

  describe('isSessionRevoked', () => {
    it('returns true for a revoked session', () => {
      sessions = [makeSession({ id: 's1', revoked: true })];
      assert.equal(isSessionRevoked('s1'), true);
    });

    it('returns false for a non-revoked session', () => {
      sessions = [makeSession({ id: 's1', revoked: false })];
      assert.equal(isSessionRevoked('s1'), false);
    });

    it('returns false for an unknown session id', () => {
      sessions = [];
      assert.equal(isSessionRevoked('missing'), false);
    });

    it('returns false when the session id is undefined', () => {
      assert.equal(isSessionRevoked(undefined), false);
    });
  });
});
