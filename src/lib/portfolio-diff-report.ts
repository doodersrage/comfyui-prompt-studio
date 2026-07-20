import { getComfyModelDefinition } from "./comfy-models";
import type { ModelPortfolioItem } from "./model-portfolio";
import { downloadTextFile } from "./history-export-formats";

export function buildPortfolioDiffMarkdown(items: ModelPortfolioItem[], draft: string): string {
  const lines = [
    "# Cross-model prompt diff",
    "",
    `Draft: ${draft.trim()}`,
    "",
    ...items.flatMap((item) => {
      const model = getComfyModelDefinition(item.model);
      return [
        `## ${model.label} (\`${item.model}\`)`,
        `- Architecture: ${model.category}`,
        `- Profile: ${model.profile}`,
        `- Node: ${model.comfyNode}`,
        `- Guidance: ${model.description}`,
        "",
        item.error ? `Error: ${item.error}` : item.prompt || "(empty)",
        "",
      ];
    }),
  ];
  return lines.join("\n");
}

export function buildPortfolioDiffHtml(items: ModelPortfolioItem[], draft: string): string {
  const sections = items
    .map((item) => {
      const model = getComfyModelDefinition(item.model);
      const body = item.error
        ? `<p style="color:#f87171">${escapeHtml(item.error)}</p>`
        : `<pre>${escapeHtml(item.prompt)}</pre>`;
      return `<section><h2>${escapeHtml(model.label)}</h2><p><code>${escapeHtml(item.model)}</code> · ${escapeHtml(model.profile)}</p><p>${escapeHtml(model.description)}</p>${body}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Portfolio diff</title></head><body><h1>Cross-model prompt diff</h1><p>${escapeHtml(draft.trim())}</p>${sections}</body></html>`;
}

export function downloadPortfolioDiffReport(
  items: ModelPortfolioItem[],
  draft: string,
  format: "markdown" | "html",
): void {
  if (format === "html") {
    downloadTextFile(buildPortfolioDiffHtml(items, draft), "portfolio-diff.html", "text/html");
    return;
  }
  downloadTextFile(buildPortfolioDiffMarkdown(items, draft), "portfolio-diff.md", "text/markdown");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
