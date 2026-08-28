'use client';

import type { ReactNode } from 'react';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { AnatomyGuardMode } from '@/lib/anatomy-guard';
import type {
  ModelSamplerOverrideFields,
  ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model-resolution-defaults';
import type { QueueQualityProfile } from '@/lib/queue-quality-profile';
import type { RenderRealismMode } from '@/lib/render-realism';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { SessionLoraStrengthOverrides } from '@/lib/lora-stack';
import type { SessionActiveLoraIdsByModel } from '@/lib/model-lora-map';
import SharedLoraEmbeddingsBlock from '@/components/shared-tool-controls/SharedLoraEmbeddingsBlock';
import SharedQualitySamplingSection from '@/components/shared-tool-controls/SharedQualitySamplingSection';
import SharedWildcardsRetrySection from '@/components/shared-tool-controls/SharedWildcardsRetrySection';
import SharedPinsAutomationSection from '@/components/shared-tool-controls/SharedPinsAutomationSection';

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
      <SharedLoraEmbeddingsBlock
        cloudEngine={cloudEngine}
        advancedOpenByDefault={advancedOpenByDefault}
        sessionLoraStrengthOverrides={sessionLoraStrengthOverrides}
        sessionActiveLoraIds={sessionActiveLoraIds}
        sessionActiveLoraIdsByModel={sessionActiveLoraIdsByModel}
        shared={shared}
        checkboxClass={checkboxClass}
        onSessionActiveLoraIdsChange={onSessionActiveLoraIdsChange}
        onSessionLoraStrengthOverridesChange={onSessionLoraStrengthOverridesChange}
        roleplayVariant={roleplayVariant}
        onSharedSettingsChange={onSharedSettingsChange}
      />

      {roleplayVariant ? null : identitySurface}

      <SharedQualitySamplingSection
        cloudEngine={cloudEngine}
        systemPathActive={systemPathActive}
        samplerOverrides={samplerOverrides}
        advancedOpenByDefault={advancedOpenByDefault}
        shared={shared}
        samplerPreset={samplerPreset}
        onSamplerPresetChange={onSamplerPresetChange}
        onSamplerOverridesChange={onSamplerOverridesChange}
        resolutionOrientation={resolutionOrientation}
        resolutionSizeTier={resolutionSizeTier}
        onResolutionOrientationChange={onResolutionOrientationChange}
        onResolutionSizeTierChange={onResolutionSizeTierChange}
        queueQualityProfile={queueQualityProfile}
        onQueueQualityProfileChange={onQueueQualityProfileChange}
        toolId={toolId}
        toolProfileOverride={toolProfileOverride}
        onToolQueueQualityChange={onToolQueueQualityChange}
        lockedVariationSeed={lockedVariationSeed}
        roleplayVariant={roleplayVariant}
        recipesShared={recipesShared}
        onRecipesApplied={onRecipesApplied}
        renderRealismMode={renderRealismMode}
        onRenderRealismModeChange={onRenderRealismModeChange}
        anatomyGuardMode={anatomyGuardMode}
        onAnatomyGuardModeChange={onAnatomyGuardModeChange}
        recommendFromText={recommendFromText}
        onModelChange={onModelChange}
      />

      <SharedWildcardsRetrySection
        roleplayVariant={roleplayVariant}
        expandWildcards={expandWildcards}
        onExpandWildcardsChange={onExpandWildcardsChange}
        checkboxClass={checkboxClass}
        wildcardSeed={wildcardSeed}
        onWildcardSeedChange={onWildcardSeedChange}
        wildcardPreviewText={wildcardPreviewText}
        recommendFromText={recommendFromText}
        wildcardPreview={wildcardPreview}
        onWildcardPreviewChange={onWildcardPreviewChange}
        shared={shared}
        autoRetryOnOom={autoRetryOnOom}
        onAutoRetryOnOomChange={onAutoRetryOnOomChange}
        oomRetryDowngrade={oomRetryDowngrade}
        onOomRetryDowngradeChange={onOomRetryDowngradeChange}
      />

      <SharedPinsAutomationSection
        roleplayVariant={roleplayVariant}
        showWardrobeOption={showWardrobeOption}
        onAlwaysIncludeClothingChange={onAlwaysIncludeClothingChange}
        onSeedLlmWithIngredientsChange={onSeedLlmWithIngredientsChange}
        seedLlmWithIngredients={seedLlmWithIngredients}
        checkboxClass={checkboxClass}
        alwaysIncludeClothing={alwaysIncludeClothing}
        wardrobeHelp={wardrobeHelp}
        lockedWardrobeId={lockedWardrobeId}
        lockedLocation={lockedLocation}
        lockedVariationSeed={lockedVariationSeed}
        onAutoFixRulesChange={onAutoFixRulesChange}
        lockedWardrobeLabel={lockedWardrobeLabel}
        onClearLockedWardrobe={onClearLockedWardrobe}
        onClearLockedLocation={onClearLockedLocation}
        onClearLockedVariationSeed={onClearLockedVariationSeed}
        autoFixRules={autoFixRules}
        onActiveCharacterDescriptorChange={onActiveCharacterDescriptorChange}
        activeCharacterDescriptor={activeCharacterDescriptor}
      />
    </>
  );
}
