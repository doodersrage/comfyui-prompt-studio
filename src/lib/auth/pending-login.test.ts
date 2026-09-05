import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createHmac } from 'node:crypto';

const TEST_SECRET = 'test-secret-key';
const getSessionSecret = mock.fn(() => TEST_SECRET);

mock.module('./config', {
  namedExports: { getSessionSecret },
});

function sign(payload: string): string {
  return createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
}

function makeToken(
  payload: Record<string, unknown>,
  opts: { badSignature?: boolean } = {}
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = opts.badSignature ? 'invalid-signature' : sign(encoded);
  return `${encoded}.${signature}`;
}

describe('auth/pending-login', async () => {
  const { createPendingLoginToken, parsePendingLoginToken } = await import('./pending-login');

  describe('createPendingLoginToken / parsePendingLoginToken round trip', () => {
    it('round-trips a valid token', () => {
      const token = createPendingLoginToken('u1');
      const parsed = parsePendingLoginToken(token);
      assert.ok(parsed);
      assert.equal(parsed?.userId, 'u1');
      assert.equal(typeof parsed?.exp, 'number');
    });

    it('sets an expiry roughly 5 minutes in the future', () => {
      const before = Date.now();
      const token = createPendingLoginToken('u1');
      const parsed = parsePendingLoginToken(token)!;
      assert.ok(parsed.exp >= before + 5 * 60 * 1000 - 1000);
      assert.ok(parsed.exp <= Date.now() + 5 * 60 * 1000 + 1000);
    });

    it('produces a token with exactly one dot separating payload and signature', () => {
      const token = createPendingLoginToken('u1');
      assert.equal(token.split('.').length, 2);
    });
  });

  describe('parsePendingLoginToken', () => {
    it('returns null for a malformed token missing the signature', () => {
      assert.equal(parsePendingLoginToken('just-a-payload'), null);
    });

    it('returns null for a tampered payload', () => {
      const token = createPendingLoginToken('u1');
      const [encoded] = token.split('.');
      assert.equal(parsePendingLoginToken(`${encoded}.wrongsignature`), null);
    });

    it('returns null when the signature does not match the payload', () => {
      const token = makeToken({ userId: 'u1', exp: Date.now() + 100000 }, { badSignature: true });
      assert.equal(parsePendingLoginToken(token), null);
    });

    it('returns null for an expired token', () => {
      const token = makeToken({ userId: 'u1', exp: Date.now() - 1000 });
      assert.equal(parsePendingLoginToken(token), null);
    });

    it('returns null when the payload has no userId', () => {
      const token = makeToken({ exp: Date.now() + 100000 });
      assert.equal(parsePendingLoginToken(token), null);
    });

    it('returns null when the payload is not valid JSON', () => {
      const badPayload = Buffer.from('not json', 'utf8').toString('base64url');
      const token = `${badPayload}.${sign(badPayload)}`;
      assert.equal(parsePendingLoginToken(token), null);
    });

    it('returns null when the encoded payload segment is empty', () => {
      assert.equal(parsePendingLoginToken('.signature'), null);
    });
  });
});
