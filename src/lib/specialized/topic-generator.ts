import {
  buildMandatoryLocationBlock,
  parseSettingHint,
} from "../hint-location";
import { chatCompletion } from "../llm-client";
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmModel,
  resolveRequestTemplateFallback,
} from "../llm-request-options";
import { stripPromptArtifacts } from "../prompt-cleanup";
import { buildTemplateTopicList, normalizeTopicPhrase } from "./scene-pools";
import { mergeLocationExclusions } from "../location-exclusions";
import type { TopicGenerateResult, TopicOptions } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseTopicLines(raw: string, count: number): string[] {
  const cleaned = stripPromptArtifacts(raw);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*[\d]+[.)]\s*/, "")
        .replace(/^\s*[-*•]\s*/, "")
        .trim(),
    )
    .filter(Boolean);

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const normalized = normalizeTopicPhrase(line);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);

    if (unique.length >= count) {
      break;
    }
  }

  return unique;
}

export async function generateTopics(
  options: TopicOptions,
): Promise<TopicGenerateResult> {
  const count = clamp(options.count ?? 10, 3, 24);
  const variety = clamp(options.variety ?? 50, 0, 100);
  const seedTopic = options.seedTopic?.trim() || null;
  const settingHint = parseSettingHint(seedTopic ?? undefined);
  const locationBlock = buildMandatoryLocationBlock(settingHint.location);

  const systemPrompt = `You are a creative topic generator for AI image generation.
- Produce exactly ${count} distinct topic ideas as brief phrases (roughly 4–18 words each).
- Each topic must be visually concrete—settings, subjects, moods, or scenes someone could turn into an image prompt.
- Topics must differ meaningfully; avoid near-duplicates or rephrasings of the same idea.
- ${
    settingHint.location
      ? `When a mandatory setting is provided, every topic must take place in or clearly relate to "${settingHint.location}". Vary subject, mood, and activity—not the city or environment.`
      : seedTopic
        ? `Every topic should relate to, riff on, or expand the seed theme "${seedTopic}". Vary angle, setting, mood, era, and subject while staying connected.`
        : "Cover diverse genres, moods, and settings with no single required theme."
  }
- Variety level: ${variety}/100 (higher = bolder, stranger, more unexpected combinations).
${options.avoidedTokensInstruction ? `- ${options.avoidedTokensInstruction}` : ""}
- Output ONLY the topic lines, one per line. No numbering, bullets, labels, markdown, or blank lines.`;

  const userMessage = [
    locationBlock,
    seedTopic
      ? `Seed theme: ${settingHint.remainder || seedTopic}\n\nWrite ${count} related image topics.`
      : `Write ${count} varied image topics with no seed theme.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (resolveRequestLlmEnabled(options.llm)) {
    try {
      const content = await chatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        maxTokens: Math.min(1400, count * 48),
        temperature: options.llm?.temperature ?? 0.72 + variety / 140,
        model: resolveRequestLlmModel(options.llm),
      });

      const topics = parseTopicLines(content, count);
      const minimum = Math.min(3, count);

      if (topics.length >= minimum) {
        return {
          topics,
          provider: "llm",
          seedTopic,
          count: topics.length,
        };
      }

      throw new Error("LLM returned too few topics.");
    } catch (error) {
      if (!resolveRequestTemplateFallback(options.llm)) {
        throw error instanceof Error ? error : new Error("Topic generation failed.");
      }

      console.warn(
        "[topic-generator] LLM failed, using template fallback:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const topics = buildTemplateTopicList({
    seedTopic: seedTopic ?? undefined,
    count,
    recentLocations: mergeLocationExclusions(
      options.recentLocations,
      options.blockedLocations,
    ),
    avoidedTokens: options.avoidedTokens,
  });

  return {
    topics,
    provider: "template",
    seedTopic,
    count: topics.length,
  };
}
