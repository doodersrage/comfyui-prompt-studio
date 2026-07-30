import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models';
import { getDetailLimits, type DetailLevel } from './detail-level';
import { compactPromptForProfile } from './prompt-compact';
import { trimPromptToMaxChars } from './qwen-clarity';

export type CompactPromptResult = {
  prompt: string;
  beforeChars: number;
  afterChars: number;
  maxChars: number;
};

export function compactPromptToLimit(
  prompt: string,
  model: ComfyImageModel,
  detail: DetailLevel = 'balanced'
): CompactPromptResult {
  const trimmed = prompt.trim();
  const { maxChars } = getDetailLimits(detail, model);
  const profile = getComfyModelDefinition(model).profile;
  const compacted = trimPromptToMaxChars(compactPromptForProfile(trimmed, profile), maxChars);

  return {
    prompt: compacted,
    beforeChars: trimmed.length,
    afterChars: compacted.length,
    maxChars,
  };
}
