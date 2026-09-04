import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  GenerateStreamBusyError,
  streamGeneratePrompt,
  type GenerateStreamResult,
} from './generate-stream-client';

function sseStream(blocks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= blocks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(blocks[index]));
      index += 1;
    },
  });
}

function sseBlock(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const original = globalThis.fetch;

function installFetchStub(impl: () => Response | Promise<Response>) {
  globalThis.fetch = (() => Promise.resolve(impl())) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = original;
});

describe('generate-stream-client', () => {
  describe('streamGeneratePrompt', () => {
    it('accumulates delta events via onDelta and resolves with the done payload', async () => {
      const done: GenerateStreamResult = {
        prompt: 'final prompt',
        mode: 'positive',
        provider: 'llm',
        model: 'flux',
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
      };
      installFetchStub(
        () =>
          new Response(sseStream([sseBlock('delta', { text: 'hel' }), sseBlock('delta', { text: 'lo' }), sseBlock('done', done)]), {
            status: 200,
          })
      );
      const deltas: Array<{ delta: string; accumulated: string }> = [];
      const result = await streamGeneratePrompt(
        {},
        { onDelta: (delta, accumulated) => deltas.push({ delta, accumulated }) }
      );
      assert.deepEqual(result, done);
      assert.deepEqual(deltas, [
        { delta: 'hel', accumulated: 'hel' },
        { delta: 'lo', accumulated: 'hello' },
      ]);
    });

    it('handles an SSE block split across multiple stream chunks', async () => {
      const done: GenerateStreamResult = {
        prompt: 'p',
        mode: 'positive',
        provider: 'template',
        model: 'flux',
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
      };
      const full = sseBlock('done', done);
      const mid = Math.floor(full.length / 2);
      installFetchStub(() => new Response(sseStream([full.slice(0, mid), full.slice(mid)]), { status: 200 }));
      const result = await streamGeneratePrompt({});
      assert.deepEqual(result, done);
    });

    it('handles a trailing block with no terminating blank line', async () => {
      const done: GenerateStreamResult = {
        prompt: 'p',
        mode: 'negative',
        provider: 'template',
        model: 'flux',
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
      };
      // No trailing "\n\n" — handled by the post-loop buffer.trim() flush.
      const block = `event: done\ndata: ${JSON.stringify(done)}`;
      installFetchStub(() => new Response(sseStream([block]), { status: 200 }));
      const result = await streamGeneratePrompt({});
      assert.deepEqual(result, done);
    });

    it('ignores malformed SSE blocks (unparsable JSON data)', async () => {
      const done: GenerateStreamResult = {
        prompt: 'p',
        mode: 'positive',
        provider: 'template',
        model: 'flux',
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
      };
      installFetchStub(
        () =>
          new Response(sseStream(['event: delta\ndata: not-json\n\n', sseBlock('done', done)]), {
            status: 200,
          })
      );
      const result = await streamGeneratePrompt({});
      assert.deepEqual(result, done);
    });

    it('ignores a delta event with no text field', async () => {
      const done: GenerateStreamResult = {
        prompt: 'p',
        mode: 'positive',
        provider: 'template',
        model: 'flux',
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
      };
      installFetchStub(
        () =>
          new Response(sseStream([sseBlock('delta', { other: 1 }), sseBlock('done', done)]), {
            status: 200,
          })
      );
      const deltas: string[] = [];
      const result = await streamGeneratePrompt({}, { onDelta: d => deltas.push(d) });
      assert.deepEqual(result, done);
      assert.deepEqual(deltas, []);
    });

    it('throws with the stream error message when an error event is emitted', async () => {
      installFetchStub(
        () =>
          new Response(sseStream([sseBlock('error', { message: 'custom failure' })]), {
            status: 200,
          })
      );
      await assert.rejects(() => streamGeneratePrompt({}), /custom failure/);
    });

    it('throws a default message for an error event with no message field', async () => {
      installFetchStub(
        () => new Response(sseStream([sseBlock('error', {})]), { status: 200 })
      );
      await assert.rejects(() => streamGeneratePrompt({}), /Generation failed\./);
    });

    it('throws when the stream ends without a done event', async () => {
      installFetchStub(
        () =>
          new Response(sseStream([sseBlock('delta', { text: 'hi' })]), {
            status: 200,
          })
      );
      await assert.rejects(() => streamGeneratePrompt({}), /Prompt stream ended without a result\./);
    });

    it('throws GenerateStreamBusyError with retryAfter on a 429 response', async () => {
      installFetchStub(
        () => new Response(JSON.stringify({ error: 'Busy, try later', retryAfter: 30 }), { status: 429 })
      );
      await assert.rejects(
        () => streamGeneratePrompt({}),
        (err: unknown) => {
          assert.ok(err instanceof GenerateStreamBusyError);
          assert.equal(err.message, 'Busy, try later');
          assert.equal(err.retryAfter, 30);
          return true;
        }
      );
    });

    it('throws a generic Error (not GenerateStreamBusyError) for a non-429 non-ok response', async () => {
      installFetchStub(() => new Response(JSON.stringify({ error: 'Server exploded' }), { status: 500 }));
      await assert.rejects(
        () => streamGeneratePrompt({}),
        (err: unknown) => {
          assert.ok(!(err instanceof GenerateStreamBusyError));
          assert.ok(err instanceof Error);
          assert.equal(err.message, 'Server exploded');
          return true;
        }
      );
    });

    it('falls back to a generic status message when a non-ok response body is not JSON', async () => {
      installFetchStub(() => new Response('not json', { status: 503 }));
      await assert.rejects(() => streamGeneratePrompt({}), /Stream request failed \(503\)\./);
    });

    it('falls back to a generic message when the response is ok but has no body', async () => {
      installFetchStub(() => new Response(null, { status: 200 }));
      await assert.rejects(() => streamGeneratePrompt({}));
    });

    it('sends the request body and content-type header', async () => {
      let capturedInit: RequestInit | undefined;
      const done: GenerateStreamResult = {
        prompt: 'p',
        mode: 'positive',
        provider: 'template',
        model: 'flux',
        comfyNode: 'node-1',
        limits: { maxChars: 500, maxSentences: 5, maxTokens: 200 },
      };
      globalThis.fetch = ((_url: string, init?: RequestInit) => {
        capturedInit = init;
        return Promise.resolve(new Response(sseStream([sseBlock('done', done)]), { status: 200 }));
      }) as typeof fetch;
      await streamGeneratePrompt({ tool: 'generate', hints: 'x' });
      assert.equal(capturedInit?.method, 'POST');
      assert.equal((capturedInit?.headers as Record<string, string>)['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(capturedInit?.body as string), { tool: 'generate', hints: 'x' });
    });
  });
});
