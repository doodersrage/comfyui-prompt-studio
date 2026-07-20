import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";

export type HistoryEntryNavigation = {
  path: string;
  mode?: "solo" | "duo" | "compose";
};

const TOOL_PATHS: Record<string, string> = {
  pet: "/pet",
  fantasy: "/fantasy",
  background: "/background",
  character: "/character",
  generate: "/",
  randomScene: "/",
  topics: "/topics",
  variations: "/variations",
};

export function resolveHistoryEntryNavigation(
  entry: PromptHistoryEntry,
): HistoryEntryNavigation {
  const sceneMode =
    entry.tool === "compose"
      ? "compose"
      : entry.tool === "duo" || entry.diagnostics?.inferred.duoMode
        ? "duo"
        : entry.tool === "character"
          ? "solo"
          : null;

  if (sceneMode !== null) {
    return { path: "/character", mode: sceneMode };
  }

  return { path: TOOL_PATHS[entry.tool] ?? "/" };
}

export function extractHintsFromHistoryEntry(entry: PromptHistoryEntry): string {
  if (entry.hints?.trim()) {
    return entry.hints.trim();
  }
  if (entry.tool === "generate" || entry.tool === "randomScene") {
    return entry.prompt.slice(0, 500);
  }
  return entry.prompt.slice(0, 400);
}
