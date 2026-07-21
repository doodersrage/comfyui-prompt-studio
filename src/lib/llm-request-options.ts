import { allowTemplateFallback, getLlmTemperature } from "./llm-env";
import type { SharedToolSettings } from "./settings-cache";

export type LlmRequestOptions = {
  temperature?: number;
  allowTemplateFallback?: boolean;
};

export function parseLlmRequestOptions(body?: {
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
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

  return {
    temperature,
    allowTemplateFallback: allowFallback,
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

export function llmRunnerOptions(llm?: LlmRequestOptions): {
  temperature?: number;
  allowTemplateFallback?: boolean;
} {
  if (!llm) {
    return {};
  }
  return {
    temperature: llm.temperature,
    allowTemplateFallback: llm.allowTemplateFallback,
  };
}

export function sharedLlmRequestBody(
  shared: Pick<
    SharedToolSettings,
    "sessionLlmTemperature" | "sessionAllowTemplateFallback"
  >,
): { llmTemperature?: number; allowTemplateFallback?: boolean } {
  return {
    ...(typeof shared.sessionLlmTemperature === "number"
      ? { llmTemperature: shared.sessionLlmTemperature }
      : {}),
    ...(typeof shared.sessionAllowTemplateFallback === "boolean"
      ? { allowTemplateFallback: shared.sessionAllowTemplateFallback }
      : {}),
  };
}
