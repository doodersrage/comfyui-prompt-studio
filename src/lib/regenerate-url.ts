import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";

const TOOL_PATHS: Record<string, string> = {
  pet: "/pet",
  fantasy: "/fantasy",
  background: "/background",
  character: "/character",
  generate: "/",
  randomScene: "/",
};

export function buildRegenerateUrl(entry: PromptHistoryEntry): string {
  const sceneMode =
    entry.tool === "compose"
      ? "compose"
      : entry.tool === "duo" || entry.diagnostics?.inferred.duoMode
        ? "duo"
        : entry.tool === "character"
          ? "solo"
          : null;

  const path =
    sceneMode !== null
      ? "/character"
      : TOOL_PATHS[entry.tool] ?? "/";

  const params = new URLSearchParams();
  if (sceneMode) {
    params.set("mode", sceneMode);
  }
  if (entry.tool === "randomScene") {
    params.set("source", "random");
  }
  if (entry.hints?.trim()) {
    params.set("hints", entry.hints.trim());
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
