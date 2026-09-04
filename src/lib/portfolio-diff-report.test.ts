import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ModelPortfolioItem } from './model-portfolio';

const downloadTextFile = mock.fn((_content: string, _filename: string, _mime: string) => {});
mock.module('./history-export-formats', { namedExports: { downloadTextFile } });

afterEach(() => {
  downloadTextFile.mock.resetCalls();
});

describe('portfolio-diff-report', async () => {
  const { buildPortfolioDiffMarkdown, buildPortfolioDiffHtml, downloadPortfolioDiffReport } =
    await import('./portfolio-diff-report');

  const items: ModelPortfolioItem[] = [
    { model: 'sdxl', prompt: 'a cat in a garden' } as ModelPortfolioItem,
    { model: 'sd1.5', prompt: '', error: 'timed out' } as ModelPortfolioItem,
  ];

  describe('buildPortfolioDiffMarkdown', () => {
    it('includes a heading and details section per item, using the draft in the header', () => {
      const markdown = buildPortfolioDiffMarkdown(items, '  a garden scene  ');
      assert.ok(markdown.startsWith('# Cross-model prompt diff'));
      assert.ok(markdown.includes('Draft: a garden scene'));
      assert.ok(markdown.includes('- Architecture:'));
      assert.ok(markdown.includes('a cat in a garden'));
    });

    it('shows "Error: <message>" instead of the prompt for a failed item', () => {
      const markdown = buildPortfolioDiffMarkdown(items, 'x');
      assert.ok(markdown.includes('Error: timed out'));
    });

    it('shows "(empty)" for an item with neither an error nor a prompt', () => {
      const markdown = buildPortfolioDiffMarkdown(
        [{ model: 'sdxl', prompt: '' } as ModelPortfolioItem],
        'x'
      );
      assert.ok(markdown.includes('(empty)'));
    });

    it('returns just the header for an empty items array', () => {
      const markdown = buildPortfolioDiffMarkdown([], 'x');
      assert.equal(markdown, '# Cross-model prompt diff\n\nDraft: x\n');
    });
  });

  describe('buildPortfolioDiffHtml', () => {
    it('embeds the trimmed draft as a meta line and one section per item', () => {
      const html = buildPortfolioDiffHtml(items, '  a garden scene  ');
      assert.ok(html.includes('Draft: a garden scene'));
      assert.ok(html.includes('a cat in a garden'));
      assert.ok(html.includes('timed out'));
    });

    it('escapes HTML-significant characters in the prompt and error text', () => {
      const html = buildPortfolioDiffHtml(
        [{ model: 'sdxl', prompt: '<script>alert(1)</script>' } as ModelPortfolioItem],
        'x'
      );
      assert.ok(!html.includes('<script>alert(1)</script>'));
      assert.ok(html.includes('&lt;script&gt;'));
    });

    it('omits the meta line entirely when the draft is blank', () => {
      const html = buildPortfolioDiffHtml(items, '   ');
      assert.ok(!html.includes('Draft:'));
    });
  });

  describe('downloadPortfolioDiffReport', () => {
    it('downloads markdown by default filename/mime for format "markdown"', () => {
      downloadPortfolioDiffReport(items, 'x', 'markdown');
      assert.equal(downloadTextFile.mock.calls.length, 1);
      const [content, filename, mime] = downloadTextFile.mock.calls[0]!.arguments as [
        string,
        string,
        string,
      ];
      assert.ok(content.startsWith('# Cross-model prompt diff'));
      assert.equal(filename, 'portfolio-diff.md');
      assert.equal(mime, 'text/markdown');
    });

    it('downloads html for format "html"', () => {
      downloadPortfolioDiffReport(items, 'x', 'html');
      const [, filename, mime] = downloadTextFile.mock.calls[0]!.arguments as [string, string, string];
      assert.equal(filename, 'portfolio-diff.html');
      assert.equal(mime, 'text/html');
    });
  });
});
