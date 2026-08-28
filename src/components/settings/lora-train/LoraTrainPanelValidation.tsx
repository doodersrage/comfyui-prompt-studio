'use client';

import { Button } from '@/components/ui/Button';
import type { LoraTrainPanelViewModel } from '@/components/settings/lora-train/useLoraTrainPanel';

type Props = Pick<
  LoraTrainPanelViewModel,
  'validationPrompt' | 'queueValidationByPrompt' | 'onStatus'
>;

export function LoraTrainPanelValidation({
  validationPrompt,
  queueValidationByPrompt,
  onStatus,
}: Props) {
  if (!validationPrompt) {
    return null;
  }

  return (
    <div className="ui-surface-inset space-y-2">
      <p className="type-heading text-[var(--text-primary)]">Validation prompt</p>
      <p className="type-caption text-[var(--text-muted)]">
        Smoke-test the new LoRA with a short portrait prompt. Queue directly or copy into Generate /
        Refine.
      </p>
      <code className="block whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/60 px-3 py-2 text-sm text-[var(--text-primary)]">
        {validationPrompt}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="accent-outline"
          size="sm"
          onClick={() => {
            void queueValidationByPrompt(validationPrompt);
          }}
        >
          Queue validation
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(validationPrompt);
              onStatus?.('Validation prompt copied.');
            } catch {
              onStatus?.('Could not copy validation prompt.');
            }
          }}
        >
          Copy prompt
        </Button>
      </div>
    </div>
  );
}
