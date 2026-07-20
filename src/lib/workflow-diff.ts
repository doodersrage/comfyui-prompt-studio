export type WorkflowDiffLine = {
  type: "add" | "remove" | "same";
  text: string;
};

export function diffWorkflowJson(
  left: string,
  right: string,
): { lines: WorkflowDiffLine[]; changed: number } {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const max = Math.max(leftLines.length, rightLines.length);
  const lines: WorkflowDiffLine[] = [];
  let changed = 0;

  for (let index = 0; index < max; index += 1) {
    const leftLine = leftLines[index];
    const rightLine = rightLines[index];
    if (leftLine === rightLine) {
      if (leftLine !== undefined) {
        lines.push({ type: "same", text: leftLine });
      }
      continue;
    }
    if (leftLine !== undefined) {
      lines.push({ type: "remove", text: leftLine });
      changed += 1;
    }
    if (rightLine !== undefined) {
      lines.push({ type: "add", text: rightLine });
      changed += 1;
    }
  }

  return { lines, changed };
}

export function formatWorkflowForDiff(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
