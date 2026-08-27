'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { AnatomyGuardMode } from '@/lib/anatomy-guard';
import type {
  ModelSamplerOverrideFields,
  ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import { hasModelSamplerOverrides } from '@/lib/model-sampler-defaults';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model-resolution-defaults';
import {
  formatQueueQualityProfileLabel,
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import type { RenderRealismMode } from '@/lib/render-realism';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { PINNED_VARIATION_SEED_LABEL } from '@/lib/tool-ui-labels';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import {
  countSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora-stack';
import { hasSessionLoraIdsForModel, type SessionActiveLoraIdsByModel } from '@/lib/model-lora-map';
import { modelSupportsTextualInversion } from '@/lib/textual-inversion';
import { expandWildcardText, textHasWildcardTokens } from '@/lib/wildcard-expand';

const LoraStackSessionPicker = dynamic(() => import('@/components/LoraStackSessionPicker'), {
  ssr: false,
  loading: () => null,
});
const EmbeddingSessionChips = dynamic(() => import('@/components/EmbeddingSessionChips'), {
  ssr: false,
  loading: () => null,
});
const ModelRecommenderHints = dynamic(() => import('@/components/ModelRecommenderHints'), {
  ssr: false,
  loading: () => null,
});
const ModelSamplerHints = dynamic(() => import('@/components/ModelSamplerHints'), {
  ssr: false,
  loading: () => null,
});
const ModelResolutionHints = dynamic(() => import('@/components/ModelResolutionHints'), {
  ssr: false,
  loading: () => null,
});
const RenderRealismHints = dynamic(() => import('@/components/RenderRealismHints'), {
  ssr: false,
  loading: () => null,
});
const AnatomyGuardHints = dynamic(() => import('@/components/AnatomyGuardHints'), {
  ssr: false,
  loading: () => null,
});
const QueueQualityProfileHints = dynamic(() => import('@/components/QueueQualityProfileHints'), {
  ssr: false,
  loading: () => null,
});
const QueueRecipesPanel = dynamic(() => import('@/components/QueueRecipesPanel'), {
  ssr: false,
  loading: () => null,
});

export type SharedAdvancedSectionsProps = {
  queueQualityBlock: ReactNode;
  workflowBlock: ReactNode;
  identitySurface: ReactNode;
  cloudEngine: boolean;
  roleplayVariant: boolean;
  systemPathActive: boolean;
  advancedOpenByDefault: boolean;
  checkboxClass: string;
  shared: SharedToolSettings;
  sessionActiveLoraIds: string[] | undefined;
  sessionActiveLoraIdsByModel: SessionActiveLoraIdsByModel;
  sessionLoraStrengthOverrides: SessionLoraStrengthOverrides;
  onSessionActiveLoraIdsChange: (ids: string[] | undefined) => void;
  onSessionLoraStrengthOverridesChange: (overrides: SessionLoraStrengthOverrides) => void;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
  samplerPreset: ModelSamplerPresetTier;
  samplerOverrides: ModelSamplerOverrideFields;
  onSamplerPresetChange: (preset: ModelSamplerPresetTier) => void;
  onSamplerOverridesChange: (overrides: ModelSamplerOverrideFields) => void;
  resolutionOrientation: ResolutionOrientation;
  resolutionSizeTier: ResolutionSizeTier;
  onResolutionOrientationChange: (orientation: ResolutionOrientation) => void;
  onResolutionSizeTierChange: (tier: ResolutionSizeTier) => void;
  queueQualityProfile: QueueQualityProfile;
  onQueueQualityProfileChange: (profile: QueueQualityProfile) => void;
  toolId?: string;
  toolProfileOverride: QueueQualityProfile | undefined;
  onToolQueueQualityChange: (profile: QueueQualityProfile | undefined) => void;
  lockedVariationSeed?: string;
  recipesShared: SharedToolSettings;
  onRecipesApplied: (next: SharedToolSettings) => void;
  renderRealismMode: RenderRealismMode;
  onRenderRealismModeChange: (mode: RenderRealismMode) => void;
  anatomyGuardMode: AnatomyGuardMode;
  onAnatomyGuardModeChange: (mode: AnatomyGuardMode) => void;
  recommendFromText?: string;
  onModelChange: (model: ComfyImageModel) => void;
  expandWildcards: boolean;
  onExpandWildcardsChange: (value: boolean) => void;
  wildcardSeed: string;
  onWildcardSeedChange: (value: string) => void;
  wildcardPreviewText?: string;
  wildcardPreview: string | null;
  onWildcardPreviewChange: (value: string | null) => void;
  autoRetryOnOom: boolean;
  onAutoRetryOnOomChange: (value: boolean) => void;
  oomRetryDowngrade: boolean;
  onOomRetryDowngradeChange: (value: boolean) => void;
  showWardrobeOption: boolean;
  alwaysIncludeClothing: boolean;
  onAlwaysIncludeClothingChange?: (value: boolean) => void;
  wardrobeHelp?: string;
  seedLlmWithIngredients: boolean;
  onSeedLlmWithIngredientsChange?: (value: boolean) => void;
  lockedWardrobeId?: string;
  lockedWardrobeLabel?: string;
  onClearLockedWardrobe?: () => void;
  lockedLocation?: string;
  onClearLockedLocation?: () => void;
  onClearLockedVariationSeed?: () => void;
  autoFixRules: boolean;
  onAutoFixRulesChange?: (value: boolean) => void;
  activeCharacterDescriptor?: string;
  onActiveCharacterDescriptorChange?: (value: string) => void;
};

export default function SharedAdvancedSections({
  queueQualityBlock,
  workflowBlock,
  identitySurface,
  cloudEngine,
  roleplayVariant,
  systemPathActive,
  advancedOpenByDefault,
  checkboxClass,
  shared,
  sessionActiveLoraIds,
  sessionActiveLoraIdsByModel,
  sessionLoraStrengthOverrides,
  onSessionActiveLoraIdsChange,
  onSessionLoraStrengthOverridesChange,
  onSharedSettingsChange,
  samplerPreset,
  samplerOverrides,
  onSamplerPresetChange,
  onSamplerOverridesChange,
  resolutionOrientation,
  resolutionSizeTier,
  onResolutionOrientationChange,
  onResolutionSizeTierChange,
  queueQualityProfile,
  onQueueQualityProfileChange,
  toolId,
  toolProfileOverride,
  onToolQueueQualityChange,
  lockedVariationSeed,
  recipesShared,
  onRecipesApplied,
  renderRealismMode,
  onRenderRealismModeChange,
  anatomyGuardMode,
  onAnatomyGuardModeChange,
  recommendFromText,
  onModelChange,
  expandWildcards,
  onExpandWildcardsChange,
  wildcardSeed,
  onWildcardSeedChange,
  wildcardPreviewText,
  wildcardPreview,
  onWildcardPreviewChange,
  autoRetryOnOom,
  onAutoRetryOnOomChange,
  oomRetryDowngrade,
  onOomRetryDowngradeChange,
  showWardrobeOption,
  alwaysIncludeClothing,
  onAlwaysIncludeClothingChange,
  wardrobeHelp,
  seedLlmWithIngredients,
  onSeedLlmWithIngredientsChange,
  lockedWardrobeId,
  lockedWardrobeLabel,
  onClearLockedWardrobe,
  lockedLocation,
  onClearLockedLocation,
  onClearLockedVariationSeed,
  autoFixRules,
  onAutoFixRulesChange,
  activeCharacterDescriptor,
  onActiveCharacterDescriptorChange,
}: SharedAdvancedSectionsProps) {
  return (
    <>
      {queueQualityBlock}
      {workflowBlock}
      {!cloudEngine ? (
        <>
          <CollapsibleSection
            title="LoRA stack"
            summary={(() => {
              const tuned = countSessionLoraStrengthOverrides(sessionLoraStrengthOverrides);
              if (sessionActiveLoraIds !== undefined) {
                return `${sessionActiveLoraIds.length} selected${tuned ? ` · ${tuned} tuned` : ''}`;
              }
              return tuned
                ? `${tuned} strength tweak${tuned === 1 ? '' : 's'}`
                : 'Pick LoRAs for this model';
            })()}
            defaultOpen={advancedOpenByDefault}
            persistKey="shared-lora-stack"
          >
            <LoraStackSessionPicker
              model={shared.model}
              sessionActiveLoraIds={
                hasSessionLoraIdsForModel(sessionActiveLoraIdsByModel, shared.model)
                  ? sessionActiveLoraIds
                  : undefined
              }
              sessionLoraStrengthOverrides={sessionLoraStrengthOverrides}
              checkboxClassName={checkboxClass}
              onChange={onSessionActiveLoraIdsChange}
              onSessionStrengthOverridesChange={onSessionLoraStrengthOverridesChange}
            />
          </CollapsibleSection>

          {roleplayVariant ? null : modelSupportsTextualInversion(shared.model) ? (
            <CollapsibleSection
              title="Embeddings"
              summary={
                (shared.sessionEmbeddingTokens?.length ?? 0) > 0
                  ? `${shared.sessionEmbeddingTokens?.length} selected`
                  : 'SD/SDXL textual inversion'
              }
              defaultOpen={advancedOpenByDefault}
              persistKey="shared-embeddings"
            >
              <EmbeddingSessionChips
                model={shared.model}
                selected={shared.sessionEmbeddingTokens ?? []}
                onChange={names => {
                  if (onSharedSettingsChange) {
                    onSharedSettingsChange({ sessionEmbeddingTokens: names });
                  } else {
                    saveSharedSettings({
                      ...loadSettingsCache().shared,
                      sessionEmbeddingTokens: names,
                    });
                  }
                }}
              />
            </CollapsibleSection>
          ) : null}
        </>
      ) : null}

      {roleplayVariant ? null : identitySurface}

      {!cloudEngine ? (
        <CollapsibleSection
          title="Quality & sampling"
          summary={
            systemPathActive
              ? `Sampler${hasModelSamplerOverrides(samplerOverrides) ? ' · overrides' : ''}, resolution, realism, anatomy.`
              : `Sampler${hasModelSamplerOverrides(samplerOverrides) ? ' · overrides' : ''}, resolution, queue quality, realism, anatomy.`
          }
          defaultOpen={advancedOpenByDefault}
          persistKey="shared-quality-sampling"
        >
          <ModelSamplerHints
            model={shared.model}
            preset={samplerPreset}
            onPresetChange={onSamplerPresetChange}
            overrides={samplerOverrides}
            onOverridesChange={onSamplerOverridesChange}
          />

          <ModelResolutionHints
            model={shared.model}
            orientation={resolutionOrientation}
            sizeTier={resolutionSizeTier}
            onOrientationChange={onResolutionOrientationChange}
            onSizeTierChange={onResolutionSizeTierChange}
          />

          {!systemPathActive ? (
            <>
              <QueueQualityProfileHints
                profile={queueQualityProfile}
                samplerPreset={samplerPreset}
                resolutionSizeTier={resolutionSizeTier}
                onProfileChange={onQueueQualityProfileChange}
                toolId={toolId}
                toolProfile={toolProfileOverride}
                onToolProfileChange={onToolQueueQualityChange}
              />
              <p
                data-testid="queue-seed-quality-clarity"
                className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]"
              >
                Queue uses{' '}
                <span className="font-medium text-[var(--text-primary)]">
                  {formatQueueQualityProfileLabel(queueQualityProfile)}
                </span>
                {' · '}
                {lockedVariationSeed?.trim()
                  ? `pinned seed ${lockedVariationSeed.trim().slice(0, 24)}${lockedVariationSeed.trim().length > 24 ? '…' : ''}`
                  : 'new seed each send'}
              </p>
              {roleplayVariant ? null : (
                <QueueRecipesPanel
                  toolId={toolId}
                  shared={recipesShared}
                  qualityProfile={queueQualityProfile}
                  orientation={resolutionOrientation}
                  sizeTier={resolutionSizeTier}
                  onApplied={onRecipesApplied}
                />
              )}
            </>
          ) : null}

          <RenderRealismHints mode={renderRealismMode} onModeChange={onRenderRealismModeChange} />

          <AnatomyGuardHints
            mode={anatomyGuardMode}
            onModeChange={onAnatomyGuardModeChange}
            model={shared.model}
          />

          {roleplayVariant ? null : recommendFromText ? (
            <ModelRecommenderHints
              text={recommendFromText}
              currentModel={shared.model}
              onApplyModel={model => onModelChange(model)}
            />
          ) : null}
        </CollapsibleSection>
      ) : null}

      {roleplayVariant ? null : (
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
      )}

      {!roleplayVariant &&
      ((showWardrobeOption && onAlwaysIncludeClothingChange) || onSeedLlmWithIngredientsChange) ? (
        <>
          <FieldDivider />
          {onSeedLlmWithIngredientsChange ? (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={seedLlmWithIngredients}
                onChange={e => onSeedLlmWithIngredientsChange(e.target.checked)}
                className={checkboxClass}
              />
              <span className="space-y-1">
                <span className="type-heading block">Seed LLM with location & wardrobe</span>
                <span className="type-caption block">
                  When on, injects rolled location / outfit / environment ingredients and few-shot
                  examples. Turn off for completionist local models — only your keywords or hints go
                  to the LLM.
                </span>
              </span>
            </label>
          ) : null}
          {showWardrobeOption && onAlwaysIncludeClothingChange ? (
            <label
              className={`flex cursor-pointer items-start gap-3 ${
                onSeedLlmWithIngredientsChange ? 'mt-3' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={alwaysIncludeClothing}
                disabled={onSeedLlmWithIngredientsChange ? !seedLlmWithIngredients : false}
                onChange={e => onAlwaysIncludeClothingChange(e.target.checked)}
                className={checkboxClass}
              />
              <span className="space-y-1">
                <span className="type-heading block">Always include wardrobe</span>
                <span className="type-caption block">
                  {wardrobeHelp ??
                    'Rolls catalog outfits for people in the prompt and appends assigned clothing if the model omits it.'}
                </span>
              </span>
            </label>
          ) : null}
        </>
      ) : null}

      {!roleplayVariant &&
        (lockedWardrobeId || lockedLocation || lockedVariationSeed || onAutoFixRulesChange) && (
          <CollapsibleSection
            title="Pins & automation"
            summary="Locked scene ingredients and post-generation fixes."
            persistKey="shared-pins-automation"
            defaultOpen={Boolean(lockedWardrobeId || lockedLocation || lockedVariationSeed)}
          >
            {lockedWardrobeId && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2.5 py-1 text-[var(--tint-info-text)]">
                  Locked kit: {lockedWardrobeLabel ?? lockedWardrobeId}
                </span>
                {onClearLockedWardrobe && (
                  <Button
                    variant="ghost"
                    onClick={onClearLockedWardrobe}
                    className="!min-h-8 px-2 type-caption"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {lockedLocation && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[var(--tint-warning-text)]">
                  Locked location: {lockedLocation}
                </span>
                {onClearLockedLocation && (
                  <Button
                    variant="ghost"
                    onClick={onClearLockedLocation}
                    className="!min-h-8 px-2 type-caption"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {lockedVariationSeed && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="type-caption max-w-full truncate rounded-[var(--radius-full)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[var(--accent-text)]"
                  title={lockedVariationSeed}
                >
                  {PINNED_VARIATION_SEED_LABEL}:{' '}
                  {lockedVariationSeed.length > 48
                    ? `${lockedVariationSeed.slice(0, 48)}…`
                    : lockedVariationSeed}
                </span>
                {onClearLockedVariationSeed && (
                  <Button
                    variant="ghost"
                    onClick={onClearLockedVariationSeed}
                    className="!min-h-8 px-2 type-caption"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {onAutoFixRulesChange && (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={autoFixRules}
                  onChange={e => onAutoFixRulesChange(e.target.checked)}
                  className={checkboxClass}
                />
                <span className="space-y-1">
                  <span className="type-heading block">Auto-fix lint errors</span>
                  <span className="type-caption block">
                    After generation, apply rule-based fixes when lint reports errors.
                  </span>
                </span>
              </label>
            )}

            {onActiveCharacterDescriptorChange && (
              <div className="space-y-2">
                <FieldLabel hint="Injected into Character generation as a mandatory descriptor.">
                  Active character descriptor
                </FieldLabel>
                <textarea
                  value={activeCharacterDescriptor ?? ''}
                  onChange={event => onActiveCharacterDescriptorChange(event.target.value)}
                  rows={3}
                  placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
                  className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
                />
              </div>
            )}
          </CollapsibleSection>
        )}
    </>
  );
}
