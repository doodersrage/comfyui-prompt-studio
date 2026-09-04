import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let chatCompletionImpl: (options: unknown) => Promise<string> = async () => 'styled prompt result';
const chatCompletion = mock.fn((options: unknown) => chatCompletionImpl(options));
mock.module('./llm-client', { namedExports: { chatCompletion } });

afterEach(() => {
  chatCompletion.mock.resetCalls();
  chatCompletionImpl = async () => 'styled prompt result';
});

describe('transplantPromptStyle', async () => {
  const { transplantPromptStyle } = await import('./prompt-style-transplant');

  it('rejects a blank styleSource', async () => {
    await assert.rejects(
      () => transplantPromptStyle({ styleSource: '   ', subjectPrompt: 'a cat' }),
      /Both style source and subject prompt are required/
    );
    assert.equal(chatCompletion.mock.calls.length, 0);
  });

  it('rejects a blank subjectPrompt', async () => {
    await assert.rejects(
      () => transplantPromptStyle({ styleSource: 'moody lighting', subjectPrompt: '   ' }),
      /Both style source and subject prompt are required/
    );
  });

  it('calls chatCompletion with trimmed style/subject embedded in the user message and returns the trimmed result', async () => {
    chatCompletionImpl = async () => '  final styled prompt  ';
    const result = await transplantPromptStyle({
      styleSource: '  moody neon lighting  ',
      subjectPrompt: '  a cat on a rooftop  ',
    });
    assert.equal(result, 'final styled prompt');
    assert.equal(chatCompletion.mock.calls.length, 1);
    const arg = chatCompletion.mock.calls[0]!.arguments[0] as {
      maxTokens: number;
      temperature: number;
      model?: string;
      messages: Array<{ role: string; content: string }>;
    };
    assert.equal(arg.maxTokens, 900);
    assert.equal(arg.temperature, 0.65);
    assert.equal(arg.model, undefined);
    assert.equal(arg.messages.length, 2);
    assert.ok(arg.messages[1]!.content.includes('moody neon lighting'));
    assert.ok(arg.messages[1]!.content.includes('a cat on a rooftop'));
  });

  it('passes an explicit model through to chatCompletion', async () => {
    await transplantPromptStyle({
      styleSource: 'x',
      subjectPrompt: 'y',
      model: 'flux-2-klein',
    });
    const arg = chatCompletion.mock.calls[0]!.arguments[0] as { model?: string };
    assert.equal(arg.model, 'flux-2-klein');
  });

  it('propagates a chatCompletion rejection', async () => {
    chatCompletionImpl = async () => {
      throw new Error('llm down');
    };
    await assert.rejects(
      () => transplantPromptStyle({ styleSource: 'x', subjectPrompt: 'y' }),
      /llm down/
    );
  });
});
