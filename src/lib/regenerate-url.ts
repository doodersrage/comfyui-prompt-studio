import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import {
  extractHintsFromHistoryEntry,
  resolveHistoryEntryNavigation,
} from "./tool-navigation";

export function buildRegenerateUrl(entry: PromptHistoryEntry): string {
  const { path, mode } = resolveHistoryEntryNavigation(entry);
  const params = new URLSearchParams();

  if (mode) {
    params.set("mode", mode);
  }
  if (entry.tool === "randomScene") {
    params.set("source", "random");
  }

  const hints = extractHintsFromHistoryEntry(entry);
  if (hints) {
    params.set("hints", hints);
  } else if (entry.tool === "generate") {
    params.set("input", entry.prompt.slice(0, 500));
  }

  if (entry.model && entry.model !== "n/a") {
    params.set("model", entry.model);
  }
  const seed =
    typeof entry.metadata?.seed === "string" ? entry.metadata.seed.trim() : "";
  if (seed) {
    params.set("seed", seed);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
