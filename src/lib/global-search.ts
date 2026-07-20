import { loadPromptHistoryStore } from "./prompt-history";
import { loadComfyGallery } from "./comfyui-gallery";
import { loadScenePresets } from "./scene-presets";

export type GlobalSearchResult = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  group: "History" | "Gallery" | "Presets";
  score: number;
};

function matchScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) {
    return 100;
  }
  if (lower.startsWith(q)) {
    return 80;
  }
  if (lower.includes(q)) {
    return 50;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((token) => lower.includes(token))) {
    return 40;
  }
  return 0;
}

export function searchGlobal(query: string, limit = 12): GlobalSearchResult[] {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const results: GlobalSearchResult[] = [];

  for (const entry of loadPromptHistoryStore().slice(0, 80)) {
    const score = Math.max(
      matchScore(entry.prompt, q),
      matchScore(entry.hints ?? "", q),
      matchScore(entry.tool, q),
    );
    if (score > 0) {
      results.push({
        id: `history-${entry.id}`,
        label: entry.prompt.slice(0, 80),
        subtitle: `${entry.tool} · ${entry.model}`,
        href: `/studio?history=${entry.id}`,
        group: "History",
        score,
      });
    }
  }

  for (const entry of loadComfyGallery().slice(0, 80)) {
    const score = matchScore(entry.prompt, q);
    if (score > 0) {
      results.push({
        id: `gallery-${entry.id}`,
        label: entry.prompt.slice(0, 80),
        subtitle: entry.model ?? "gallery",
        href: `/gallery`,
        group: "Gallery",
        score,
      });
    }
  }

  for (const preset of loadScenePresets().slice(0, 120)) {
    const score = Math.max(matchScore(preset.name, q), matchScore(preset.hints ?? "", q));
    if (score > 0) {
      results.push({
        id: `preset-${preset.id}`,
        label: preset.name,
        subtitle: (preset.hints ?? "").slice(0, 60),
        href: `/?scene=${encodeURIComponent(preset.id)}`,
        group: "Presets",
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
