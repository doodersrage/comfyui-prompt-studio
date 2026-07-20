import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import {
  extractHintsFromHistoryEntry,
  resolveHistoryEntryNavigation,
} from "./tool-navigation";

export function buildUseAsHintsUrl(entry: PromptHistoryEntry): string {
  const { path, mode } = resolveHistoryEntryNavigation(entry);
  const params = new URLSearchParams();
  params.set("hintSource", "manual");

  if (mode) {
    params.set("mode", mode);
  }

  const hints = extractHintsFromHistoryEntry(entry);
  if (hints) {
    params.set("hints", hints);
  }

  if (entry.model && entry.model !== "n/a") {
    params.set("model", entry.model);
  }

  const seed =
    typeof entry.metadata?.seed === "string" ? entry.metadata.seed.trim() : "";
  if (seed) {
    params.set("seed", seed);
  }

  return `${path}?${params.toString()}`;
}
