import { normalizeTopicPhrase } from "./scene-pools";

const MAX_TOPIC_CHARS = 220;
const MIN_TOPIC_CHARS = 4;

function cleanTopicLine(line: string): string {
  return line
    .replace(/^\s*[\d]+[.)]\s*/, "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function isPlausibleTopic(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (trimmed.length < MIN_TOPIC_CHARS || trimmed.length > MAX_TOPIC_CHARS) {
    return false;
  }
  // Reject obvious run-on garbage from small models.
  if (/\d+[.)]\s*[a-z0-9]{20,}/i.test(trimmed)) {
    return false;
  }
  return true;
}

/** Split raw LLM output into topic candidates without collapsing newlines. */
export function splitTopicCandidates(raw: string): string[] {
  let text = raw.trim();
  if (!text) {
    return [];
  }

  // Strip markdown fences only — keep internal newlines.
  text = text.replace(/^```(?:[\w-]+)?\s*\n?([\s\S]*?)```$/m, "$1").trim();

  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => cleanTopicLine(String(entry ?? "")))
          .filter(Boolean);
      }
    } catch {
      // ignore
    }
  }

  const byNewline = text
    .split(/\r?\n/)
    .map(cleanTopicLine)
    .filter(Boolean);
  if (byNewline.length >= 2) {
    return byNewline;
  }

  // Numbered list collapsed onto one line: "1. foo 2. bar"
  const byNumber = text
    .split(/(?:^|\s)(?=\d+[.)]\s)/)
    .map(cleanTopicLine)
    .filter(Boolean);
  if (byNumber.length >= 2) {
    return byNumber;
  }

  const bySemi = text.split(/\s*;\s*/).map(cleanTopicLine).filter(Boolean);
  if (bySemi.length >= 2) {
    return bySemi;
  }

  const single = cleanTopicLine(text);
  if (single.length > MAX_TOPIC_CHARS) {
    const bySentence = text
      .split(/(?<=[.!?])\s+/)
      .map(cleanTopicLine)
      .filter(
        (part) =>
          part.length >= MIN_TOPIC_CHARS && part.length <= MAX_TOPIC_CHARS,
      );
    if (bySentence.length >= 2) {
      return bySentence;
    }
  }

  return single ? [single] : [];
}

/** Parse LLM topic list output into deduped phrases (preserves line structure). */
export function parseTopicLines(raw: string, count: number): string[] {
  const candidates = splitTopicCandidates(raw);
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const line of candidates) {
    const normalized = normalizeTopicPhrase(line);
    if (!isPlausibleTopic(normalized)) {
      continue;
    }
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
