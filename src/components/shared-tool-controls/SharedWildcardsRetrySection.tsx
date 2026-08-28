'use client';

import { expandWildcardText, textHasWildcardTokens } from '@/lib/wildcard-expand';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { SharedAdvancedSectionsProps } from '@/components/shared-tool-controls/SharedAdvancedSections';

export type SharedWildcardsRetrySectionProps = Pick<
  SharedAdvancedSectionsProps,
  | 'roleplayVariant'
  | 'expandWildcards'
  | 'onExpandWildcardsChange'
  | 'checkboxClass'
  | 'wildcardSeed'
  | 'onWildcardSeedChange'
  | 'wildcardPreviewText'
  | 'recommendFromText'
  | 'wildcardPreview'
  | 'onWildcardPreviewChange'
  | 'shared'
  | 'autoRetryOnOom'
  | 'onAutoRetryOnOomChange'
  | 'oomRetryDowngrade'
  | 'onOomRetryDowngradeChange'
>;

export default function SharedWildcardsRetrySection({
  roleplayVariant,
  expandWildcards,
  onExpandWildcardsChange,
  checkboxClass,
  wildcardSeed,
  onWildcardSeedChange,
  wildcardPreviewText,
  recommendFromText,
  wildcardPreview,
  onWildcardPreviewChange,
  shared,
  autoRetryOnOom,
  onAutoRetryOnOomChange,
  oomRetryDowngrade,
  onOomRetryDowngradeChange,
}: SharedWildcardsRetrySectionProps) {
  if (roleplayVariant) {
    return null;
  }

  return (
    <CollapsibleSection
      title="Wildcards & auto-retry"
      summary="Dynamic prompt tokens and OOM/execution_error auto-retry."
      defaultOpen={false}
      persistKey="shared-wildcards-oom-retry"
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={expandWildcards}
          onChange={e => onExpandWildcardsChange(e.target.checked)}
          className={checkboxClass}
        />
        <span className="space-y-1">
          <span className="type-heading block">Expand wildcards</span>
          <span className="type-caption block">
            Replace <code>__color__</code> / <code>{'{a|b|c}'}</code> style tokens in the prompt
            before queueing.
          </span>
        </span>
      </label>

      {expandWildcards && (
        <div className="space-y-2 pl-7">
          <FieldLabel hint="Same seed always expands the same way — leave blank for a fresh random roll each queue.">
            Wildcard seed (optional)
          </FieldLabel>
          <input
            type="text"
            value={wildcardSeed}
            onChange={e => onWildcardSeedChange(e.target.value)}
            placeholder="e.g. my-batch-01"
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
          {textHasWildcardTokens(wildcardPreviewText ?? recommendFromText) ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const source = (wildcardPreviewText ?? recommendFromText ?? '').trim();
                    if (!source) {
                      onWildcardPreviewChange(null);
                      return;
                    }
                    const seed =
                      wildcardSeed.trim() || `preview-${Math.floor(Math.random() * 1e9)}`;
                    onWildcardPreviewChange(
                      expandWildcardText(source, {
                        seed,
                        wildcards: shared.wildcardLists,
                      })
                    );
                  }}
                >
                  {wildcardPreview ? 'Roll again' : 'Preview expand'}
                </Button>
                {wildcardPreview ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(wildcardPreview);
                    }}
                  >
                    Copy preview
                  </Button>
                ) : null}
              </div>
              {wildcardPreview ? (
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {wildcardPreview}
                </pre>
              ) : null}
            </div>
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              Add <code>__list__</code> or <code>{'{a|b}'}</code> tokens to the draft/hints to
              preview expansion here.
            </p>
          )}
        </div>
      )}

      <FieldDivider />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={autoRetryOnOom}
          onChange={e => onAutoRetryOnOomChange(e.target.checked)}
          className={checkboxClass}
        />
        <span className="space-y-1">
          <span className="type-heading block">Auto-retry on OOM</span>
          <span className="type-caption block">
            When a Best/Good gallery job fails with an OOM/CUDA/execution_error, automatically
            re-queue it once.
          </span>
        </span>
      </label>

      <label
        className={`flex items-start gap-3 ${
          autoRetryOnOom ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        }`}
      >
        <input
          type="checkbox"
          checked={oomRetryDowngrade}
          disabled={!autoRetryOnOom}
          onChange={e => onOomRetryDowngradeChange(e.target.checked)}
          className={checkboxClass}
        />
        <span className="space-y-1">
          <span className="type-heading block">Downgrade quality on retry</span>
          <span className="type-caption block">
            Best → Good / Good → Fast on the same host; if a pool has multiple endpoints, an
            alternate one is also tried.
          </span>
        </span>
      </label>
    </CollapsibleSection>
  );
}
