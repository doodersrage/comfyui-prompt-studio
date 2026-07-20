import { loadComfyUiSettings } from "./comfyui-settings";

export type LoraTriggerLintIssue = {
  trigger: string;
  loraName?: string;
  kind: "missing-in-prompt" | "unused-in-library";
};

export function lintLoraTriggers(prompt: string): LoraTriggerLintIssue[] {
  const trimmed = prompt.trim();
  const library = loadComfyUiSettings().loraLibrary ?? [];
  const issues: LoraTriggerLintIssue[] = [];

  if (typeof window === "undefined") {
    return issues;
  }

  const lower = trimmed.toLowerCase();
  for (const entry of library) {
    const trigger = entry.triggerPhrase?.trim();
    if (!trigger) {
      continue;
    }
    if (!lower.includes(trigger.toLowerCase())) {
      issues.push({
        trigger,
        loraName: entry.label,
        kind: "missing-in-prompt",
      });
    }
  }

  return issues;
}

export function formatLoraTriggerLintSummary(issues: LoraTriggerLintIssue[]): string {
  if (issues.length === 0) {
    return "All LoRA triggers present in prompt.";
  }
  return issues
    .slice(0, 6)
    .map((issue) => `Missing trigger: ${issue.trigger}${issue.loraName ? ` (${issue.loraName})` : ""}`)
    .join(" · ");
}
