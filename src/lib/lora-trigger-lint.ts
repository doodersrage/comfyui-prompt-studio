export type LoraTriggerLintIssue = {
  trigger: string;
  loraName?: string;
  kind: "missing-in-prompt" | "unused-in-library";
};

/** Keyword trigger linting retired — use the sidebar LoRA stack picker instead. */
export function lintLoraTriggers(_prompt: string): LoraTriggerLintIssue[] {
  return [];
}

export function formatLoraTriggerLintSummary(issues: LoraTriggerLintIssue[]): string {
  if (issues.length === 0) {
    return "LoRA triggers are not required — use the sidebar LoRA stack.";
  }
  return issues
    .slice(0, 6)
    .map((issue) => `Missing trigger: ${issue.trigger}${issue.loraName ? ` (${issue.loraName})` : ""}`)
    .join(" · ");
}
