'use client';

import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { ModelPortfolioItem } from '@/lib/model-portfolio';
import type { DetailLevel } from '@/lib/detail-level';
import {
  ToolBlockGroup,
  ToolContentPanel,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { toastHeldMax } from '@/lib/app-toast';

export type StudioPortfolioTabProps = {
  accent: ToolAccent;
  detail: DetailLevel;
  portfolioDraft: string;
  portfolioModels: string;
  portfolioItems: ModelPortfolioItem[];
  portfolioStatus: string | null;
  portfolioLoading: boolean;
  onPortfolioDraftChange: (value: string) => void;
  onPortfolioModelsChange: (value: string) => void;
  onPortfolioItemsChange: (items: ModelPortfolioItem[]) => void;
  onPortfolioStatusChange: (status: string | null) => void;
  onPortfolioLoadingChange: (loading: boolean) => void;
};

export default function StudioPortfolioTab({
  accent,
  detail,
  portfolioDraft,
  portfolioModels,
  portfolioItems,
  portfolioStatus,
  portfolioLoading,
  onPortfolioDraftChange,
  onPortfolioModelsChange,
  onPortfolioItemsChange,
  onPortfolioStatusChange,
  onPortfolioLoadingChange,
}: StudioPortfolioTabProps) {
  return (
    <ToolSection title="Multi-model portfolio">
      <p className="text-sm text-[var(--text-secondary)]">
        Format one draft for several models, then queue each variant to ComfyUI.
      </p>
      <TextArea
        rows={4}
        value={portfolioDraft}
        onChange={event => onPortfolioDraftChange(event.target.value)}
        placeholder="Shared scene draft to adapt per model…"
        className={accentFocusClass(accent)}
      />
      <FieldLabel hint="Comma-separated model ids">Models</FieldLabel>
      <input
        value={portfolioModels}
        onChange={event => onPortfolioModelsChange(event.target.value)}
        className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
      />
      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          accentClassName={accentButtonClass(accent)}
          loading={portfolioLoading}
          loadingLabel="Formatting portfolio"
          disabled={!portfolioDraft.trim()}
          onClick={() => {
            void (async () => {
              onPortfolioLoadingChange(true);
              onPortfolioStatusChange('Formatting…');
              try {
                const models = portfolioModels
                  .split(',')
                  .map(entry => entry.trim())
                  .filter(Boolean) as ComfyImageModel[];
                const { generateModelPortfolio } = await import('@/lib/model-portfolio');
                const items = await generateModelPortfolio({
                  draft: portfolioDraft,
                  models,
                  detail,
                });
                onPortfolioItemsChange(items);
                onPortfolioStatusChange(
                  `Formatted ${items.filter(item => item.prompt).length}/${models.length} prompts.`
                );
              } catch (err) {
                onPortfolioStatusChange(err instanceof Error ? err.message : 'Portfolio failed.');
              } finally {
                onPortfolioLoadingChange(false);
              }
            })();
          }}
        >
          Generate portfolio
        </PrimaryButton>
        <Button
          variant="secondary"
          disabled={portfolioItems.every(item => !item.prompt.trim())}
          onClick={() => {
            void import('@/lib/model-portfolio').then(({ queueModelPortfolio }) =>
              queueModelPortfolio({
                items: portfolioItems,
                hints: portfolioDraft,
                tool: 'portfolio',
              }).then(result => {
                if (result.held > 0) {
                  onPortfolioStatusChange(
                    `Queued ${result.queued} · held ${result.held} Max until idle`
                  );
                  toastHeldMax({
                    text: 'Max portfolio jobs held until ComfyUI is idle',
                    count: result.held,
                  });
                  return;
                }
                onPortfolioStatusChange(`Queued ${result.queued} jobs.`);
              })
            );
          }}
        >
          Queue all to ComfyUI
        </Button>
        <Button
          variant="ghost"
          disabled={portfolioItems.length === 0}
          onClick={() => {
            void import('@/lib/portfolio-diff-report').then(({ downloadPortfolioDiffReport }) => {
              downloadPortfolioDiffReport(portfolioItems, portfolioDraft, 'markdown');
              onPortfolioStatusChange('Downloaded portfolio diff (Markdown).');
            });
          }}
        >
          Export diff (MD)
        </Button>
        <Button
          variant="ghost"
          disabled={portfolioItems.length === 0}
          onClick={() => {
            void import('@/lib/portfolio-diff-report').then(({ downloadPortfolioDiffReport }) => {
              downloadPortfolioDiffReport(portfolioItems, portfolioDraft, 'html');
              onPortfolioStatusChange('Downloaded portfolio diff (HTML).');
            });
          }}
        >
          Export diff (HTML)
        </Button>
      </div>
      {portfolioStatus ? (
        <p className="type-caption text-[var(--accent-text)]">{portfolioStatus}</p>
      ) : null}
      {portfolioItems.length > 0 ? (
        <ToolBlockGroup className="mt-[var(--block-gap)]">
          {portfolioItems.map(item => (
            <ToolContentPanel key={item.model} className="ui-block-group">
              <p className="type-caption text-[var(--text-muted)]">{item.model}</p>
              {item.error ? (
                <p className="text-sm ui-status-danger">{item.error}</p>
              ) : (
                <pre className="type-code max-h-40 overflow-auto whitespace-pre-wrap text-[var(--text-secondary)]">
                  {item.prompt}
                </pre>
              )}
            </ToolContentPanel>
          ))}
        </ToolBlockGroup>
      ) : null}
    </ToolSection>
  );
}
