import { allowTemplateFallback, getLlmTemperature, isLlmEnabled } from "./llm-env";
import type { SharedToolSettings } from "./settings-cache";

export type LlmRequestOptions = {
  temperature?: number;
  allowTemplateFallback?: boolean;
  /** Text model override for this request (falls back to server LLM_MODEL). */
  llmModel?: string;
  /** Vision model override for this request (falls back to server LLM_VISION_MODEL). */
  llmVisionModel?: string;
  /** false = template-only for this request/browser; undefined = server LLM_ENABLED default. */
  llmEnabled?: boolean;
};

export function parseLlmRequestOptions(body?: {
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
} | null): LlmRequestOptions {
  const temperature =
    typeof body?.llmTemperature === "number" &&
    body.llmTemperature >= 0 &&
    body.llmTemperature <= 2
      ? body.llmTemperature
      : undefined;

  const allowFallback =
    typeof body?.allowTemplateFallback === "boolean"
      ? body.allowTemplateFallback
      : undefined;

  const llmModel =
    typeof body?.llmModel === "string" && body.llmModel.trim()
      ? body.llmModel.trim()
      : undefined;

  const llmVisionModel =
    typeof body?.llmVisionModel === "string" && body.llmVisionModel.trim()
      ? body.llmVisionModel.trim()
      : undefined;

  const llmEnabled =
    typeof body?.llmEnabled === "boolean" ? body.llmEnabled : undefined;

  return {
    temperature,
    allowTemplateFallback: allowFallback,
    llmModel,
    llmVisionModel,
    llmEnabled,
  };
}

export function resolveRequestTemperature(options?: LlmRequestOptions): number {
  return getLlmTemperature(options?.temperature);
}

export function resolveRequestTemplateFallback(
  options?: LlmRequestOptions,
): boolean {
  if (typeof options?.allowTemplateFallback === "boolean") {
    return options.allowTemplateFallback;
  }
  return allowTemplateFallback();
}

/**
 * Whether the LLM path should run for this request. An explicit `llmEnabled: false`
 * (session "template-only for this browser" toggle) short-circuits to template mode
 * regardless of the server LLM_ENABLED flag; otherwise defers to the server default.
 */
export function resolveRequestLlmEnabled(options?: LlmRequestOptions): boolean {
  if (options?.llmEnabled === false) {
    return false;
  }
  return isLlmEnabled();
}

export function resolveRequestLlmModel(options?: LlmRequestOptions): string | undefined {
  return options?.llmModel?.trim() || undefined;
}

export function resolveRequestVisionModel(
  options?: LlmRequestOptions,
): string | undefined {
  return options?.llmVisionModel?.trim() || undefined;
}

export function llmRunnerOptions(llm?: LlmRequestOptions): {
  temperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
} {
  if (!llm) {
    return {};
  }
  return {
    temperature: llm.temperature,
    allowTemplateFallback: llm.allowTemplateFallback,
    llmModel: llm.llmModel,
    llmVisionModel: llm.llmVisionModel,
    llmEnabled: llm.llmEnabled,
  };
}

export function sharedLlmRequestBody(
  shared: Pick<
    SharedToolSettings,
    | "sessionLlmTemperature"
    | "sessionAllowTemplateFallback"
    | "sessionLlmModel"
    | "sessionLlmVisionModel"
    | "sessionLlmEnabled"
  >,
): {
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
} {
  return {
    ...(typeof shared.sessionLlmTemperature === "number"
      ? { llmTemperature: shared.sessionLlmTemperature }
      : {}),
    ...(typeof shared.sessionAllowTemplateFallback === "boolean"
      ? { allowTemplateFallback: shared.sessionAllowTemplateFallback }
      : {}),
    ...(shared.sessionLlmModel?.trim()
      ? { llmModel: shared.sessionLlmModel.trim() }
      : {}),
    ...(shared.sessionLlmVisionModel?.trim()
      ? { llmVisionModel: shared.sessionLlmVisionModel.trim() }
      : {}),
    ...(typeof shared.sessionLlmEnabled === "boolean"
      ? { llmEnabled: shared.sessionLlmEnabled }
      : {}),
  };
}
