import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from './password';

describe('auth/password', () => {
  describe('hashPassword', () => {
    it('produces a "scrypt$<salt>$<hash>" encoded string', () => {
      const encoded = hashPassword('correct horse battery staple');
      const parts = encoded.split('$');
      assert.equal(parts.length, 3);
      assert.equal(parts[0], 'scrypt');
      assert.ok(parts[1].length > 0);
      assert.ok(parts[2].length > 0);
    });

    it('produces different hashes for the same password (random salt)', () => {
      const a = hashPassword('same-password');
      const b = hashPassword('same-password');
      assert.notEqual(a, b);
    });

    it('does not throw for an empty string password', () => {
      assert.doesNotThrow(() => hashPassword(''));
    });
  });

  describe('verifyPassword', () => {
    it('accepts the correct password', () => {
      const encoded = hashPassword('my-secret-password');
      assert.equal(verifyPassword('my-secret-password', encoded), true);
    });

    it('rejects an incorrect password', () => {
      const encoded = hashPassword('my-secret-password');
      assert.equal(verifyPassword('not-the-password', encoded), false);
    });

    it('verifies two different hashes of the same password independently', () => {
      const a = hashPassword('shared-password');
      const b = hashPassword('shared-password');
      assert.notEqual(a, b);
      assert.equal(verifyPassword('shared-password', a), true);
      assert.equal(verifyPassword('shared-password', b), true);
    });

    it('round-trips an empty string password', () => {
      const encoded = hashPassword('');
      assert.equal(verifyPassword('', encoded), true);
      assert.equal(verifyPassword('not-empty', encoded), false);
    });

    it('returns false for a malformed encoded value (wrong algorithm)', () => {
      assert.equal(verifyPassword('anything', 'bcrypt$salt$hash'), false);
    });

    it('returns false for a malformed encoded value (missing parts)', () => {
      assert.equal(verifyPassword('anything', 'scrypt$onlysalt'), false);
      assert.equal(verifyPassword('anything', 'scrypt'), false);
      assert.equal(verifyPassword('anything', ''), false);
    });

    it('returns false rather than throwing for a salt that does not match', () => {
      assert.equal(verifyPassword('anything', 'scrypt$not-the-real-salt$deadbeef'), false);
    });

    it('is case-sensitive and whitespace-sensitive on the password', () => {
      const encoded = hashPassword('CaseSensitive');
      assert.equal(verifyPassword('casesensitive', encoded), false);
      assert.equal(verifyPassword('CaseSensitive ', encoded), false);
    });
  });
});
