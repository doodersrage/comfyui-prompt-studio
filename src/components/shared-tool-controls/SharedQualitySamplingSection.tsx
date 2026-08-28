'use client';

import dynamic from 'next/dynamic';
import { hasModelSamplerOverrides } from '@/lib/model-sampler-defaults';
import { formatQueueQualityProfileLabel } from '@/lib/queue-quality-profile';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { SharedAdvancedSectionsProps } from '@/components/shared-tool-controls/SharedAdvancedSections';

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

export type SharedQualitySamplingSectionProps = Pick<
  SharedAdvancedSectionsProps,
  | 'cloudEngine'
  | 'systemPathActive'
  | 'samplerOverrides'
  | 'advancedOpenByDefault'
  | 'shared'
  | 'samplerPreset'
  | 'onSamplerPresetChange'
  | 'onSamplerOverridesChange'
  | 'resolutionOrientation'
  | 'resolutionSizeTier'
  | 'onResolutionOrientationChange'
  | 'onResolutionSizeTierChange'
  | 'queueQualityProfile'
  | 'onQueueQualityProfileChange'
  | 'toolId'
  | 'toolProfileOverride'
  | 'onToolQueueQualityChange'
  | 'lockedVariationSeed'
  | 'roleplayVariant'
  | 'recipesShared'
  | 'onRecipesApplied'
  | 'renderRealismMode'
  | 'onRenderRealismModeChange'
  | 'anatomyGuardMode'
  | 'onAnatomyGuardModeChange'
  | 'recommendFromText'
  | 'onModelChange'
>;

export default function SharedQualitySamplingSection({
  cloudEngine,
  systemPathActive,
  samplerOverrides,
  advancedOpenByDefault,
  shared,
  samplerPreset,
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
  roleplayVariant,
  recipesShared,
  onRecipesApplied,
  renderRealismMode,
  onRenderRealismModeChange,
  anatomyGuardMode,
  onAnatomyGuardModeChange,
  recommendFromText,
  onModelChange,
}: SharedQualitySamplingSectionProps) {
  if (cloudEngine) {
    return null;
  }

  return (
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
  );
}
