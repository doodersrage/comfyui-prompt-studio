export type ModelRecommendation = {
  model: string;
  reason: string;
  confidence: number;
};

const RULES: Array<{ pattern: RegExp; model: string; reason: string }> = [
  { pattern: /\b(edit|replace|keep the subject|unchanged)\b/i, model: "qwen-image-edit-2511", reason: "Edit-style instruction detected" },
  { pattern: /\b(rapid aio|qwen aio|phr00t aio|qwen-rapid)\b/i, model: "qwen-rapid-aio-edit", reason: "Rapid AIO checkpoint workflow" },
  { pattern: /\b(rapid aio sfw|aio sfw)\b/i, model: "qwen-rapid-aio-sfw", reason: "Rapid AIO SFW checkpoint" },
  { pattern: /\b(rapid aio nsfw|aio nsfw)\b/i, model: "qwen-rapid-aio-nsfw", reason: "Rapid AIO NSFW checkpoint" },
  { pattern: /\b(lightning|lightx2v|fast qwen|4[\s-]?step qwen)\b/i, model: "qwen-image-2512-lightning-4", reason: "Fast Lightning 4-step generation" },
  { pattern: /\b(8[\s-]?step qwen|qwen lightning 8)\b/i, model: "qwen-image-2512-lightning-8", reason: "Lightning 8-step quality/speed balance" },
  { pattern: /\b(duo|two people|couple|sport|team)\b/i, model: "sdxl", reason: "Multi-person or sport scene" },
  { pattern: /\b(flux|photographic|bokeh|lens|35mm)\b/i, model: "flux-2-klein-9b-distilled", reason: "Photographic prose fits FLUX Klein 9B distilled" },
  { pattern: /\b(fast flux|klein 4b|lightweight flux|klein distilled)\b/i, model: "flux-2-klein-4b-distilled", reason: "Fast 4B Klein distilled for quick photographic drafts" },
  { pattern: /\b(klein base|klein fine.?tun)\b/i, model: "flux-2-klein", reason: "Klein base model for flexible multi-step generation" },
  { pattern: /\b(tag|1girl|masterpiece|best quality)\b/i, model: "sd1.5", reason: "Tag-style brief detected" },
  { pattern: /\b(fantasy|wizard|dragon|magic)\b/i, model: "sdxl", reason: "Rich fantasy scene prose" },
  { pattern: /\b(pet|dog|cat|animal)\b/i, model: "sdxl", reason: "Pet-focused descriptive scene" },
];

export function recommendModels(input: string, limit = 3): ModelRecommendation[] {
  const text = input.trim();
  if (!text) {
    return [
      { model: "sdxl", reason: "Balanced default for general scenes", confidence: 0.5 },
    ];
  }

  const scores = new Map<string, { reason: string; confidence: number }>();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      const existing = scores.get(rule.model);
      scores.set(rule.model, {
        reason: rule.reason,
        confidence: (existing?.confidence ?? 0) + 0.35,
      });
    }
  }

  if (scores.size === 0) {
    scores.set("sdxl", { reason: "General natural-language scene", confidence: 0.55 });
    scores.set("flux-2-klein-9b-distilled", { reason: "Alternative rich photographic prose", confidence: 0.45 });
  }

  return [...scores.entries()]
    .map(([model, meta]) => ({ model, reason: meta.reason, confidence: Math.min(1, meta.confidence) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
