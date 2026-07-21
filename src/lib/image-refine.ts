import {
  getComfyModelDefinition,
  comfyModelLabel,
} from "./comfy-models";
import { getDetailLimits } from "./detail-level";
import { visionCompletion } from "./llm-client";
import { resolveRequestLlmEnabled, resolveRequestVisionModel } from "./llm-request-options";
import { stripPromptArtifacts } from "./prompt-cleanup";
import { formatPromptForModel, sanitizeQwenPrompt } from "./qwen-clarity";
import { buildToolResult } from "./specialized/runner";
import type { ImagePromptOptions, ToolGenerateResult } from "./specialized/types";
import { enrichGenerateResult } from "./generation-diagnostics";

export type RefinePromptOptions = Pick<
  ImagePromptOptions,
  "model" | "detail" | "imageDataUrl" | "mimeType" | "llm"
> & {
  currentPrompt?: string;
  intentHints?: string;
};

export async function refineImagePrompt(
  options: RefinePromptOptions,
): Promise<ToolGenerateResult & { diagnostics: ReturnType<typeof enrichGenerateResult>["diagnostics"] }> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error("Image refine requires LLM_ENABLED=true.");
  }

  const visionModel =
    resolveRequestVisionModel(options.llm) ?? process.env.LLM_VISION_MODEL?.trim();
  if (!visionModel) {
    throw new Error("LLM_VISION_MODEL is not set.");
  }

  const modelDef = getComfyModelDefinition(options.model);
  const limits = getDetailLimits(options.detail, options.model);
  const intent = options.intentHints?.trim() ?? "";
  const current = options.currentPrompt?.trim() ?? "";

  const systemPrompt = `You refine ${comfyModelLabel(options.model)} image prompts for ComfyUI (${modelDef.comfyNode}).

Compare the reference image to the user's intent and any existing prompt draft.
Output ONE improved prompt that better matches what the user wanted while staying faithful to visible image content.

Rules:
- Fix sport/wardrobe mismatches (e.g. street clothes on cyclists, missing helmets).
- Preserve distinct left/right people when the intent describes a duo.
- ${limits.maxSentences} sentences max, ~${limits.maxChars} characters.
- Output ONLY the finished prompt—no analysis or markdown.`;

  const userMessage = [
    intent ? `User intent: ${intent}` : "Infer intent from the image.",
    current ? `Current draft to improve:\n${current}` : null,
    "Rewrite the prompt to better match intent while describing visible content.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const content = await visionCompletion({
    systemPrompt,
    textPrompt: userMessage,
    imageDataUrl: options.imageDataUrl,
    maxTokens: Math.max(limits.maxTokens + 256, 768),
    temperature: 0.35,
    model: visionModel,
  });

  const cleaned = stripPromptArtifacts(content);
  const prompt = formatPromptForModel(
    sanitizeQwenPrompt(cleaned, options.detail, intent, options.model),
    options.model,
    intent,
    "positive",
  );

  const result = buildToolResult(prompt, "llm", options.model, options.detail, {
    metadata: {
      refined: true,
      intentHints: intent || null,
      previousPrompt: current || null,
      visionModel,
    },
  });

  return enrichGenerateResult(result, intent || current);
}
