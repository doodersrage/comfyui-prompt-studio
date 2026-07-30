import type { GenerationDiagnostics } from './generation-diagnostics';

export type BatchLintItem = {
  index: number;
  prompt: string;
  topic?: string;
  diagnostics: GenerationDiagnostics | null;
  errorCount: number;
  warningCount: number;
};

export type BatchLintSummary = {
  items: BatchLintItem[];
  totalErrors: number;
  totalWarnings: number;
  blockedIndexes: number[];
};

export async function runBatchLintGate(
  prompts: Array<{ prompt: string; topic?: string }>,
  hints?: string
): Promise<BatchLintSummary> {
  const items: BatchLintItem[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  const blockedIndexes: number[] = [];

  for (let index = 0; index < prompts.length; index += 1) {
    const entry = prompts[index];
    let diagnostics: GenerationDiagnostics | null = null;
    let errorCount = 0;
    let warningCount = 0;

    try {
      const response = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hints: hints?.trim() || entry.topic || undefined,
          prompt: entry.prompt,
        }),
      });
      if (response.ok) {
        diagnostics = (await response.json()) as GenerationDiagnostics;
        errorCount = diagnostics.issues.filter(issue => issue.severity === 'error').length;
        warningCount = diagnostics.issues.filter(issue => issue.severity === 'warn').length;
      }
    } catch {
      // keep null diagnostics
    }

    totalErrors += errorCount;
    totalWarnings += warningCount;
    if (errorCount > 0) {
      blockedIndexes.push(index);
    }

    items.push({
      index,
      prompt: entry.prompt,
      topic: entry.topic,
      diagnostics,
      errorCount,
      warningCount,
    });
  }

  return { items, totalErrors, totalWarnings, blockedIndexes };
}

export async function batchFixPrompts(prompts: string[], hints?: string): Promise<string[]> {
  const fixed: string[] = [];

  for (const prompt of prompts) {
    try {
      const response = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hints, prompt }),
      });
      const data = (await response.json()) as { prompt?: string };
      fixed.push(data.prompt?.trim() || prompt);
    } catch {
      fixed.push(prompt);
    }
  }

  return fixed;
}

export function filterBatchByLintIndexes<T>(items: T[], blockedIndexes: number[]): T[] {
  const blocked = new Set(blockedIndexes);
  return items.filter((_, index) => !blocked.has(index));
}
