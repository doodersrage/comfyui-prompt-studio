import {
  buildModelClarityAddendum,
  buildModelSystemPrompt,
  getComfyModelDefinition,
  type ComfyImageModel,
} from "../comfy-models";
import { getDetailLimits } from "../detail-level";
import {
  resolveRequestTemplateFallback,
  resolveRequestTemperature,
} from "../llm-request-options";
import { chatCompletion, isLlmEnabled } from "../llm-client";
import { isThinkingOnlyArtifact, stripPromptArtifacts } from "../prompt-cleanup";
import { ensureSinglePersonPrompt } from "../single-person";
import { sanitizeQwenPrompt, formatPromptForModel, trimPromptToMaxChars, compactPromptForProfile } from "../qwen-clarity";
import type { DetailLevel } from "../detail-level";
import type { ToolGenerateResult, ToolLimits } from "./types";

export function buildToolResult(
  prompt: string,
  provider: ToolGenerateResult["provider"],
  model: ComfyImageModel,
  detail: DetailLevel,
  extras?: Partial<ToolGenerateResult>,
): ToolGenerateResult {
  const limits = getDetailLimits(detail, model);
  const modelDef = getComfyModelDefinition(model);

  return {
    prompt,
    provider,
    model,
    comfyNode: modelDef.comfyNode,
    limits: {
      minChars: limits.minChars,
      maxChars: limits.maxChars,
      maxSentences: limits.maxSentences,
      maxTokens: limits.maxTokens,
    },
    ...extras,
  };
}

export async function runSpecializedPrompt(options: {
  model: ComfyImageModel;
  detail: DetailLevel;
  toolInstructions: string;
  userMessage: string;
  templateFallback: () => string | Promise<string>;
  sanitizeInput?: string;
  temperature?: number;
  allowTemplateFallback?: boolean;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
  seed?: string;
  soloSubject?: boolean;
  enforceMinimum?: boolean;
  postProcessPrompt?: (prompt: string) => string;
  /** When set, report this model in the result (e.g. selected edit checkpoint). */
  resultModel?: ComfyImageModel;
}): Promise<ToolGenerateResult> {
  const limits = getDetailLimits(options.detail, options.model);
  const maxTokens = options.maxTokens ?? limits.maxTokens;
  const reportedModel = options.resultModel ?? options.model;
  const systemPrompt = `${buildModelSystemPrompt(options.model, "positive")}

${options.toolInstructions}

${buildModelClarityAddendum(options.detail, options.model)}

Output ONLY the raw prompt text. No quotes around the whole prompt, labels, markdown, numbered analysis, thinking steps, or explanations.`;

  if (isLlmEnabled()) {
    try {
      const content = await chatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: options.userMessage },
        ],
        maxTokens,
        temperature: resolveRequestTemperature({ temperature: options.temperature }),
      });

      const prompt = finalizeSpecializedPrompt(
        content,
        options.detail,
        options.model,
        options.sanitizeInput ?? options.userMessage,
        options.soloSubject,
        options.enforceMinimum,
        options.postProcessPrompt,
      );

      return buildToolResult(prompt, "llm", reportedModel, options.detail, {
        seed: options.seed,
        metadata: options.metadata,
      });
    } catch (error) {
      if (!resolveRequestTemplateFallback({ allowTemplateFallback: options.allowTemplateFallback })) {
        throw error instanceof Error ? error : new Error("Generation failed.");
      }
      console.warn(
        "[specialized-generator] LLM failed, using template fallback:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const prompt = finalizeSpecializedPrompt(
    await Promise.resolve(options.templateFallback()),
    options.detail,
    options.model,
    options.sanitizeInput ?? options.userMessage,
    options.soloSubject,
    options.enforceMinimum,
    options.postProcessPrompt,
  );

  return buildToolResult(prompt, "template", reportedModel, options.detail, {
    seed: options.seed,
    metadata: options.metadata,
  });
}

function finalizeSpecializedPrompt(
  raw: string,
  detail: DetailLevel,
  model: ComfyImageModel,
  input: string,
  soloSubject = false,
  enforceMinimum = true,
  postProcessPrompt?: (prompt: string) => string,
): string {
  const cleaned = stripPromptArtifacts(raw);
  if (!cleaned.trim() || isThinkingOnlyArtifact(cleaned)) {
    throw new Error("LLM returned reasoning text instead of a prompt.");
  }

  let prompt = sanitizeQwenPrompt(cleaned, detail, input, model, {
    soloSubject,
    enforceMinimum,
  });

  if (postProcessPrompt) {
    prompt = postProcessPrompt(prompt);
  }

  const profile = getComfyModelDefinition(model).profile;
  prompt = compactPromptForProfile(prompt, profile);

  const { maxChars } = getDetailLimits(detail, model);
  if (prompt.length > maxChars) {
    prompt = trimPromptToMaxChars(prompt, maxChars);
  }

  if (soloSubject) {
    prompt = ensureSinglePersonPrompt(
      prompt,
      getComfyModelDefinition(model).profile,
    );
  }

  return formatPromptForModel(prompt, model, input, "positive");
}

export function richDetailLimits(model: ComfyImageModel): ToolLimits {
  return getDetailLimits("rich", model);
}
