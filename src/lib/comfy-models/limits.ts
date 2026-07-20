import type { PromptLimits, PromptProfileId } from "./types";

type DetailLevel = "concise" | "balanced" | "rich";

const S2: Pick<PromptLimits, "minSentences" | "maxSentences"> = {
  minSentences: 2,
  maxSentences: 2,
};
const S3: Pick<PromptLimits, "minSentences" | "maxSentences"> = {
  minSentences: 3,
  maxSentences: 3,
};
const S34: Pick<PromptLimits, "minSentences" | "maxSentences"> = {
  minSentences: 3,
  maxSentences: 4,
};
const S45: Pick<PromptLimits, "minSentences" | "maxSentences"> = {
  minSentences: 4,
  maxSentences: 5,
};
const S56: Pick<PromptLimits, "minSentences" | "maxSentences"> = {
  minSentences: 5,
  maxSentences: 6,
};
const S68: Pick<PromptLimits, "minSentences" | "maxSentences"> = {
  minSentences: 6,
  maxSentences: 8,
};

function limits(
  concise: PromptLimits,
  balanced: PromptLimits,
  rich: PromptLimits,
): Record<DetailLevel, PromptLimits> {
  return { concise, balanced, rich };
}

export const PROFILE_LIMITS: Record<
  PromptProfileId,
  Record<DetailLevel, PromptLimits>
> = {
  sd15_weighted: limits(
    { ...S2, maxChars: 220, maxTokens: 160 },
    { ...S3, maxChars: 380, maxTokens: 280 },
    { ...S45, maxChars: 520, maxTokens: 400 },
  ),
  sdxl_nlp: limits(
    { ...S2, maxChars: 280, maxTokens: 200 },
    { ...S3, maxChars: 520, maxTokens: 380 },
    { ...S45, maxChars: 780, maxTokens: 560 },
  ),
  sd3_nlp: limits(
    { ...S2, maxChars: 320, maxTokens: 240 },
    { ...S34, minChars: 380, maxChars: 680, maxTokens: 480 },
    { ...S56, minChars: 650, maxChars: 950, maxTokens: 720 },
  ),
  flux_prose: limits(
    { ...S2, maxChars: 300, maxTokens: 240 },
    { ...S34, minChars: 420, maxChars: 720, maxTokens: 512 },
    { ...S68, minChars: 850, maxChars: 1200, maxTokens: 900 },
  ),
  flux_klein: limits(
    { ...S2, maxChars: 250, maxTokens: 200 },
    { ...S34, minChars: 450, maxChars: 700, maxTokens: 480 },
    { ...S68, minChars: 900, maxChars: 1200, maxTokens: 900 },
  ),
  flux_schnell: limits(
    { ...S2, maxChars: 280, maxTokens: 200 },
    { ...S3, maxChars: 480, maxTokens: 360 },
    { ...S45, maxChars: 650, maxTokens: 480 },
  ),
  qwen_edit: limits(
    { ...S2, maxChars: 280, maxTokens: 180 },
    { ...S3, maxChars: 520, maxTokens: 380 },
    { ...S45, maxChars: 920, maxTokens: 720 },
  ),
  qwen_edit_instruction: limits(
    { minSentences: 1, maxSentences: 2, maxChars: 220, maxTokens: 160 },
    { minSentences: 2, maxSentences: 3, maxChars: 420, maxTokens: 300 },
    { minSentences: 3, maxSentences: 4, maxChars: 680, maxTokens: 480 },
  ),
  qwen_t2i_factual: limits(
    { ...S2, maxChars: 320, maxTokens: 220 },
    { ...S34, minChars: 380, maxChars: 780, maxTokens: 512 },
    { ...S56, minChars: 700, maxChars: 1000, maxTokens: 768 },
  ),
  qwen_t2i_rich: limits(
    { ...S2, maxChars: 400, maxTokens: 256 },
    { ...S34, minChars: 550, maxChars: 800, maxTokens: 512 },
    { ...S68, minChars: 1100, maxChars: 1400, maxTokens: 1024 },
  ),
  hunyuan_nlp: limits(
    { ...S2, maxChars: 300, maxTokens: 220 },
    { ...S34, minChars: 400, maxChars: 700, maxTokens: 480 },
    { ...S56, minChars: 700, maxChars: 1000, maxTokens: 768 },
  ),
  pixart_nlp: limits(
    { ...S2, maxChars: 260, maxTokens: 200 },
    { ...S3, maxChars: 480, maxTokens: 360 },
    { ...S45, maxChars: 720, maxTokens: 520 },
  ),
  lumina_nlp: limits(
    { ...S2, maxChars: 320, maxTokens: 240 },
    { ...S34, minChars: 400, maxChars: 680, maxTokens: 480 },
    { ...S56, minChars: 650, maxChars: 950, maxTokens: 720 },
  ),
  cascade_nlp: limits(
    { ...S2, maxChars: 240, maxTokens: 180 },
    { ...S3, maxChars: 420, maxTokens: 300 },
    { ...S45, maxChars: 620, maxTokens: 460 },
  ),
  instruct_pix2pix: limits(
    { minSentences: 1, maxSentences: 2, maxChars: 200, maxTokens: 160 },
    { minSentences: 2, maxSentences: 2, maxChars: 320, maxTokens: 240 },
    { minSentences: 2, maxSentences: 3, maxChars: 480, maxTokens: 340 },
  ),
  omnigen_instruction: limits(
    { minSentences: 1, maxSentences: 2, maxChars: 240, maxTokens: 180 },
    { minSentences: 2, maxSentences: 3, maxChars: 460, maxTokens: 320 },
    { minSentences: 3, maxSentences: 4, maxChars: 680, maxTokens: 480 },
  ),
  generic_nlp: limits(
    { ...S2, maxChars: 300, maxTokens: 220 },
    { ...S3, maxChars: 520, maxTokens: 380 },
    { ...S45, maxChars: 800, maxTokens: 600 },
  ),
  video_motion: limits(
    { ...S2, maxChars: 280, maxTokens: 200 },
    { ...S3, maxChars: 480, maxTokens: 360 },
    { ...S45, maxChars: 720, maxTokens: 520 },
  ),
};

export function getProfileLimits(
  profile: PromptProfileId,
  detail: DetailLevel,
): PromptLimits {
  return PROFILE_LIMITS[profile][detail];
}
