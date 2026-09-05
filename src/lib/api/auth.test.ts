import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const apiError = mock.fn((message: string, status: number) => ({ __apiError: true, message, status }));
mock.module('@/lib/api/response', { namedExports: { apiError } });

const ORIGINAL_TOKEN = process.env.PROMPT_API_TOKEN;

function request(input: { url?: string; method?: string; headers?: Record<string, string> } = {}) {
  return new Request(input.url ?? 'https://app.example.com/api/thing', {
    method: input.method ?? 'GET',
    headers: input.headers,
  });
}

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.PROMPT_API_TOKEN;
  } else {
    process.env.PROMPT_API_TOKEN = ORIGINAL_TOKEN;
  }
  apiError.mock.resetCalls();
});

describe('api/auth', async () => {
  const { authorizeApiRequest, isApiAuthConfigured, isTrustedSameOriginRequest } = await import(
    './auth'
  );

  describe('isTrustedSameOriginRequest', () => {
    it('returns true when the Origin header matches the request origin', () => {
      const req = request({
        url: 'https://app.example.com/api/thing',
        headers: { origin: 'https://app.example.com' },
      });
      assert.equal(isTrustedSameOriginRequest(req), true);
    });

    it('returns false when the Origin header does not match the request origin', () => {
      const req = request({
        url: 'https://app.example.com/api/thing',
        headers: { origin: 'https://evil.example.com' },
      });
      assert.equal(isTrustedSameOriginRequest(req), false);
    });

    it('returns false when the Origin header is not a valid URL', () => {
      const req = request({ headers: { origin: 'not a url' } });
      assert.equal(isTrustedSameOriginRequest(req), false);
    });

    it('returns true when there is no Origin but sec-fetch-site is same-origin', () => {
      const req = request({ headers: { 'sec-fetch-site': 'same-origin' } });
      assert.equal(isTrustedSameOriginRequest(req), true);
    });

    it('returns true when there is no Origin but sec-fetch-site is none', () => {
      const req = request({ headers: { 'sec-fetch-site': 'none' } });
      assert.equal(isTrustedSameOriginRequest(req), true);
    });

    it('returns false when there is no Origin and sec-fetch-site is cross-site', () => {
      const req = request({ headers: { 'sec-fetch-site': 'cross-site' } });
      assert.equal(isTrustedSameOriginRequest(req), false);
    });

    it('returns false when there is neither Origin nor sec-fetch-site (non-browser client)', () => {
      const req = request();
      assert.equal(isTrustedSameOriginRequest(req), false);
    });
  });

  describe('isApiAuthConfigured', () => {
    it('returns false when PROMPT_API_TOKEN is unset', () => {
      delete process.env.PROMPT_API_TOKEN;
      assert.equal(isApiAuthConfigured(), false);
    });

    it('returns false when PROMPT_API_TOKEN is blank/whitespace', () => {
      process.env.PROMPT_API_TOKEN = '   ';
      assert.equal(isApiAuthConfigured(), false);
    });

    it('returns true when PROMPT_API_TOKEN is set', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      assert.equal(isApiAuthConfigured(), true);
    });
  });

  describe('authorizeApiRequest', () => {
    it('always allows OPTIONS requests regardless of token config', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ method: 'OPTIONS' });
      assert.equal(authorizeApiRequest(req), null);
    });

    it('allows any request when no token is configured', () => {
      delete process.env.PROMPT_API_TOKEN;
      const req = request();
      assert.equal(authorizeApiRequest(req), null);
    });

    it('allows a request with a matching Bearer token', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ headers: { authorization: 'Bearer secret-token' } });
      assert.equal(authorizeApiRequest(req), null);
    });

    it('allows a request with a matching X-Prompt-Api-Token header', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ headers: { 'x-prompt-api-token': 'secret-token' } });
      assert.equal(authorizeApiRequest(req), null);
    });

    it('rejects a request with a wrong Bearer token and no same-origin signal', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ headers: { authorization: 'Bearer wrong-token' } });
      const result = authorizeApiRequest(req);
      assert.notEqual(result, null);
      assert.equal(apiError.mock.calls.length, 1);
      assert.equal(apiError.mock.calls[0]!.arguments[1], 401);
    });

    it('allows a request with a wrong/missing token when it is trusted same-origin', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ headers: { 'sec-fetch-site': 'same-origin' } });
      assert.equal(authorizeApiRequest(req), null);
    });

    it('rejects a request with no token and no same-origin signal when a token is configured', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request();
      const result = authorizeApiRequest(req);
      assert.notEqual(result, null);
    });

    it('is case-insensitive about the "Bearer" prefix', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ headers: { authorization: 'bearer secret-token' } });
      assert.equal(authorizeApiRequest(req), null);
    });

    it('ignores a blank Bearer token value', () => {
      process.env.PROMPT_API_TOKEN = 'secret-token';
      const req = request({ headers: { authorization: 'Bearer   ' } });
      const result = authorizeApiRequest(req);
      assert.notEqual(result, null);
    });
  });
});
