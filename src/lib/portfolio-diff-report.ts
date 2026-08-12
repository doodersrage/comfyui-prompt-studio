import { getComfyModelDefinition } from './comfy-models';
import type { ModelPortfolioItem } from './model-portfolio';
import { brandedHtmlDocument, brandedHtmlSection, escapeBrandedHtml } from './branded-html-shell';
import { downloadTextFile } from './history-export-formats';

export function buildPortfolioDiffMarkdown(items: ModelPortfolioItem[], draft: string): string {
  const lines = [
    '# Cross-model prompt diff',
    '',
    `Draft: ${draft.trim()}`,
    '',
    ...items.flatMap(item => {
      const model = getComfyModelDefinition(item.model);
      return [
        `## ${model.label} (\`${item.model}\`)`,
        `- Architecture: ${model.category}`,
        `- Profile: ${model.profile}`,
        `- Node: ${model.comfyNode}`,
        `- Guidance: ${model.description}`,
        '',
        item.error ? `Error: ${item.error}` : item.prompt || '(empty)',
        '',
      ];
    }),
  ];
  return lines.join('\n');
}

export function buildPortfolioDiffHtml(items: ModelPortfolioItem[], draft: string): string {
  const sections = items
    .map(item => {
      const model = getComfyModelDefinition(item.model);
      const body = item.error
        ? `<p style="color:#fda4af;font-family:system-ui,sans-serif;">${escapeBrandedHtml(item.error)}</p>`
        : `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.5;font-family:ui-monospace,monospace;">${escapeBrandedHtml(item.prompt)}</pre>`;
      return brandedHtmlSection(
        `<h2 style="margin:0 0 8px;font-size:16px;">${escapeBrandedHtml(model.label)}</h2><p style="font-family:system-ui,sans-serif;color:#a1a4ad;"><code style="color:#9eb6e0;">${escapeBrandedHtml(item.model)}</code> · ${escapeBrandedHtml(model.profile)}</p><p style="font-family:system-ui,sans-serif;color:#71717a;">${escapeBrandedHtml(model.description)}</p>${body}`
      );
    })
    .join('');

  return brandedHtmlDocument({
    title: 'Cross-model prompt diff',
    subtitle: 'Portfolio compare export',
    metaLine: draft.trim() ? `Draft: ${draft.trim()}` : undefined,
    bodyHtml: sections,
  });
}

export function downloadPortfolioDiffReport(
  items: ModelPortfolioItem[],
  draft: string,
  format: 'markdown' | 'html'
): void {
  if (format === 'html') {
    downloadTextFile(buildPortfolioDiffHtml(items, draft), 'portfolio-diff.html', 'text/html');
    return;
  }
  downloadTextFile(buildPortfolioDiffMarkdown(items, draft), 'portfolio-diff.md', 'text/markdown');
}
