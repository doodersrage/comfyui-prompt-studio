import { diffPromptWords } from "./prompt-diff";
import { analyzePromptDiagnostics } from "./prompt-diagnostics";

export type PromptMergeResult = {
  merged: string;
  sources: { left: string; right: string };
  diff: ReturnType<typeof diffPromptWords>;
  lintErrors: string[];
};

function uniquePhrases(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Cherry-pick unique phrases from two prompts, preferring longer descriptive segments. */
export function mergePrompts(left: string, right: string): PromptMergeResult {
  const leftParts = left.split(/[,;.]\s+/).map((part) => part.trim()).filter(Boolean);
  const rightParts = right.split(/[,;.]\s+/).map((part) => part.trim()).filter(Boolean);
  const mergedParts = uniquePhrases([...leftParts, ...rightParts]);
  const merged = mergedParts.join(", ");
  const diagnostics = analyzePromptDiagnostics("", merged);
  const lintErrors = diagnostics.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  return {
    merged,
    sources: { left: left.trim(), right: right.trim() },
    diff: diffPromptWords(left, merged),
    lintErrors,
  };
}
