import { visionCompletion } from "./llm-client";

export type VisionReviewResult = {
  suggestedRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  critique: string;
};

/** Short training-style caption for LoRA dataset export. */
export async function captionGalleryImage(input: {
  imageDataUrl: string;
  prompt?: string;
  model?: string;
}): Promise<string> {
  const text = await visionCompletion({
    systemPrompt:
      'Write a short LoRA training caption for the image. Reply with JSON only: {"caption":"..."}. Prefer concrete visual details, 12–40 words, no quotes around the whole caption.',
    textPrompt: input.prompt?.trim()
      ? `Original prompt (for context, do not copy verbatim):\n${input.prompt.trim()}`
      : "Describe the image for LoRA training.",
    imageDataUrl: input.imageDataUrl,
    maxTokens: 220,
    temperature: 0.3,
  });

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
      caption?: string;
    };
    if (parsed.caption?.trim()) {
      return parsed.caption.trim();
    }
  } catch {
    // fall through
  }
  return text.replace(/^["']|["']$/g, "").trim().slice(0, 320);
}

export async function reviewGalleryImage(input: {
  imageDataUrl: string;
  prompt: string;
  model?: string;
}): Promise<VisionReviewResult> {
  const text = await visionCompletion({
    systemPrompt:
      'Review the image against the prompt. Reply with JSON only: {"rating":1-5,"tags":["..."],"critique":"one sentence"}. Rating 5=excellent match, 1=poor.',
    textPrompt: `Prompt:\n${input.prompt}`,
    imageDataUrl: input.imageDataUrl,
    maxTokens: 400,
    temperature: 0.2,
  });

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
      rating?: number;
      tags?: string[];
      critique?: string;
    };
    const rating = Math.min(5, Math.max(1, Math.round(parsed.rating ?? 3))) as VisionReviewResult["suggestedRating"];
    return {
      suggestedRating: rating,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8).map(String) : [],
      critique: parsed.critique?.trim() || "No critique returned.",
    };
  } catch {
    return {
      suggestedRating: 3,
      tags: [],
      critique: text.slice(0, 240),
    };
  }
}
