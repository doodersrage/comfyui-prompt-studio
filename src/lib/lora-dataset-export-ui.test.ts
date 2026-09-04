import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { promptLoraDatasetExportOptions } from './lora-dataset-export-ui';

function installWindowPromptStub(responses: Array<string | null>): { calls: unknown[] } {
  const calls: unknown[] = [];
  let index = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      prompt(message: string, defaultValue?: string) {
        calls.push([message, defaultValue]);
        const value = responses[index];
        index += 1;
        return value ?? null;
      },
    },
  });
  return { calls };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('lora-dataset-export-ui', () => {
  describe('promptLoraDatasetExportOptions', () => {
    it('defaults to prompt caption mode with no trigger word when window is undefined (SSR guard)', () => {
      assert.deepEqual(promptLoraDatasetExportOptions(), { captionMode: 'prompt' });
    });

    it('returns null when the trigger-word prompt is cancelled', () => {
      installWindowPromptStub([null]);
      assert.equal(promptLoraDatasetExportOptions(), null);
    });

    it('returns null when the caption-mode prompt is cancelled', () => {
      installWindowPromptStub(['my-trigger', null]);
      assert.equal(promptLoraDatasetExportOptions(), null);
    });

    it('trims the trigger word and defaults to undefined when blank', () => {
      installWindowPromptStub(['   ', 'prompt']);
      const result = promptLoraDatasetExportOptions();
      assert.equal(result?.triggerWord, undefined);
    });

    it('trims a real trigger word', () => {
      installWindowPromptStub(['  my-trigger  ', 'prompt']);
      const result = promptLoraDatasetExportOptions();
      assert.equal(result?.triggerWord, 'my-trigger');
    });

    it('accepts "tags" and "vision" caption modes case-insensitively', () => {
      installWindowPromptStub(['', 'TAGS']);
      assert.equal(promptLoraDatasetExportOptions()?.captionMode, 'tags');

      installWindowPromptStub(['', 'Vision']);
      assert.equal(promptLoraDatasetExportOptions()?.captionMode, 'vision');
    });

    it('falls back to "prompt" for any other caption mode input', () => {
      installWindowPromptStub(['', 'something-else']);
      assert.equal(promptLoraDatasetExportOptions()?.captionMode, 'prompt');
    });

    it("empty-string trigger-word response (as opposed to a cancelled/null prompt) is treated as a real answer, not a cancel", () => {
      installWindowPromptStub(['', 'prompt']);
      assert.notEqual(promptLoraDatasetExportOptions(), null);
    });
  });
});
