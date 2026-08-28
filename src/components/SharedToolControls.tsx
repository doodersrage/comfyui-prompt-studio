'use client';

import { useSharedToolGenerationSettings } from '@/hooks/useSharedToolGenerationSettings';
import { useSharedToolModelWorkflow } from '@/hooks/useSharedToolModelWorkflow';
import { getDetailLimits } from '@/lib/detail-level';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { accentRingClass } from '@/lib/tool-theme';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { workspaceControlsDefaultOpen } from '@/lib/workspace-mode';
import SharedModelSurface from '@/components/shared-tool-controls/SharedModelSurface';
import SharedPrimaryControls from '@/components/shared-tool-controls/SharedPrimaryControls';
import SharedToolAdvancedCollapsible from '@/components/shared-tool-controls/SharedToolAdvancedCollapsible';
import type { SharedToolControlsProps } from '@/components/shared-tool-controls/types';

export default function SharedToolControls({
  shared,
  onModelChange,
  onDetailChange,
  detailHelp,
  showWardrobeOption = false,
  alwaysIncludeClothing = true,
  onAlwaysIncludeClothingChange,
  wardrobeHelp,
  seedLlmWithIngredients = true,
  onSeedLlmWithIngredientsChange,
  lockedWardrobeId,
  lockedWardrobeLabel,
  onClearLockedWardrobe,
  lockedLocation,
  onClearLockedLocation,
  lockedVariationSeed,
  onClearLockedVariationSeed,
  autoFixRules = true,
  onAutoFixRulesChange,
  onWorkflowPresetChange,
  activeCharacterDescriptor,
  onActiveCharacterDescriptorChange,
  recommendFromText,
  wildcardPreviewText,
  toolId,
  preferEditModels = false,
  onSharedSettingsChange,
  variant = 'default',
}: SharedToolControlsProps) {
  const workspaceMode = useWorkspaceMode();
  const advancedOpenByDefault = workspaceControlsDefaultOpen(workspaceMode);
  const roleplayVariant = variant === 'roleplay';
  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);
  const checkboxClass = `mt-1 h-4 w-4 rounded-[var(--radius-sm)] border-[var(--border-default)] bg-[var(--bg-muted)] ${accentRingClass()}`;

  const {
    samplerPreset,
    samplerOverrides,
    resolutionOrientation,
    resolutionSizeTier,
    renderRealismMode,
    anatomyGuardMode,
    queueQualityProfile,
    expandWildcards,
    wildcardSeed,
    wildcardPreview,
    setWildcardPreview,
    autoRetryOnOom,
    oomRetryDowngrade,
    lastLookRecipe,
    sessionActiveLoraIds,
    sessionActiveLoraIdsByModel,
    sessionLoraStrengthOverrides,
    setSessionActiveLoraIds,
    setSessionLoraStrengthOverrides,
    handleSessionActiveLoraIdsChange,
    handleSessionLoraStrengthOverridesChange,
    handleSamplerPresetChange,
    handleSamplerOverridesChange,
    handleResolutionOrientationChange,
    handleResolutionSizeTierChange,
    handleRenderRealismModeChange,
    handleAnatomyGuardModeChange,
    handleQueueQualityProfileChange,
    handleExpandWildcardsChange,
    handleWildcardSeedChange,
    handleAutoRetryOnOomChange,
    handleOomRetryDowngradeChange,
    toolProfileOverride,
    handleToolQueueQualityChange,
    handleRecipesApplied,
    recipesShared,
  } = useSharedToolGenerationSettings({
    shared,
    toolId,
    onModelChange,
    onSharedSettingsChange,
  });

  const {
    workflowSelection,
    selectedWorkflowId,
    selectedWorkflowJson,
    supportedModels,
    pickerModels,
    showAllModelsOverride,
    handleModelChange,
    handleDiffusersAssetChange,
    diffusersSelectedAssetId,
    handleShowAllModels,
    systemWorkflowChoice,
    systemQualityHint,
    systemPathActive,
    cloudEngine,
    categoryLocked,
    modelFilterHint,
    workflowManualOverrideRef,
  } = useSharedToolModelWorkflow({
    shared,
    toolId,
    preferEditModels,
    queueQualityProfile,
    samplerPreset,
    resolutionSizeTier,
    onModelChange,
    onWorkflowPresetChange,
    onSharedSettingsChange,
    setSessionActiveLoraIds,
    setSessionLoraStrengthOverrides,
  });

  return (
    <div className="ui-sidebar-dense ui-field-stack space-y-5">
      <SharedModelSurface
        shared={shared}
        cloudEngine={cloudEngine}
        systemPathActive={systemPathActive}
        roleplayVariant={roleplayVariant}
        toolId={toolId}
        diffusersSelectedAssetId={diffusersSelectedAssetId}
        onDiffusersAssetChange={handleDiffusersAssetChange}
        pickerModels={pickerModels}
        modelFilterHint={modelFilterHint}
        categoryLocked={categoryLocked}
        showAllModelsOverride={showAllModelsOverride}
        supportedModelsSource={supportedModels.source}
        onShowAllModels={handleShowAllModels}
        onModelChange={handleModelChange}
        onCharacterModelChange={onModelChange}
        recommendFromText={recommendFromText}
        onSharedSettingsChange={onSharedSettingsChange}
        selectedWorkflowJson={selectedWorkflowJson}
      />

      <SharedPrimaryControls
        roleplayVariant={roleplayVariant}
        shared={shared}
        detailHelp={detailHelp}
        modelLabel={selectedModel.label}
        activeLimits={activeLimits}
        onDetailChange={onDetailChange}
        queueQualityProfile={queueQualityProfile}
        onQueueQualityProfileChange={handleQueueQualityProfileChange}
        systemPathActive={systemPathActive}
        systemQualityHint={systemQualityHint}
        lastLookRecipe={lastLookRecipe}
        onRecipesApplied={handleRecipesApplied}
        toolId={toolId}
        onSharedSettingsChange={onSharedSettingsChange}
      />

      <SharedToolAdvancedCollapsible
        cloudEngine={cloudEngine}
        roleplayVariant={roleplayVariant}
        systemPathActive={systemPathActive}
        advancedOpenByDefault={advancedOpenByDefault}
        checkboxClass={checkboxClass}
        shared={shared}
        sessionActiveLoraIds={sessionActiveLoraIds}
        sessionActiveLoraIdsByModel={sessionActiveLoraIdsByModel}
        sessionLoraStrengthOverrides={sessionLoraStrengthOverrides}
        onSessionActiveLoraIdsChange={handleSessionActiveLoraIdsChange}
        onSessionLoraStrengthOverridesChange={handleSessionLoraStrengthOverridesChange}
        onSharedSettingsChange={onSharedSettingsChange}
        samplerPreset={samplerPreset}
        samplerOverrides={samplerOverrides}
        onSamplerPresetChange={handleSamplerPresetChange}
        onSamplerOverridesChange={handleSamplerOverridesChange}
        resolutionOrientation={resolutionOrientation}
        resolutionSizeTier={resolutionSizeTier}
        onResolutionOrientationChange={handleResolutionOrientationChange}
        onResolutionSizeTierChange={handleResolutionSizeTierChange}
        queueQualityProfile={queueQualityProfile}
        onQueueQualityProfileChange={handleQueueQualityProfileChange}
        toolId={toolId}
        toolProfileOverride={toolProfileOverride}
        onToolQueueQualityChange={handleToolQueueQualityChange}
        lockedVariationSeed={lockedVariationSeed}
        recipesShared={recipesShared}
        onRecipesApplied={handleRecipesApplied}
        renderRealismMode={renderRealismMode}
        onRenderRealismModeChange={handleRenderRealismModeChange}
        anatomyGuardMode={anatomyGuardMode}
        onAnatomyGuardModeChange={handleAnatomyGuardModeChange}
        recommendFromText={recommendFromText}
        onModelChange={handleModelChange}
        expandWildcards={expandWildcards}
        onExpandWildcardsChange={handleExpandWildcardsChange}
        wildcardSeed={wildcardSeed}
        onWildcardSeedChange={handleWildcardSeedChange}
        wildcardPreviewText={wildcardPreviewText}
        wildcardPreview={wildcardPreview}
        onWildcardPreviewChange={setWildcardPreview}
        autoRetryOnOom={autoRetryOnOom}
        onAutoRetryOnOomChange={handleAutoRetryOnOomChange}
        oomRetryDowngrade={oomRetryDowngrade}
        onOomRetryDowngradeChange={handleOomRetryDowngradeChange}
        showWardrobeOption={showWardrobeOption}
        alwaysIncludeClothing={alwaysIncludeClothing}
        onAlwaysIncludeClothingChange={onAlwaysIncludeClothingChange}
        wardrobeHelp={wardrobeHelp}
        seedLlmWithIngredients={seedLlmWithIngredients}
        onSeedLlmWithIngredientsChange={onSeedLlmWithIngredientsChange}
        lockedWardrobeId={lockedWardrobeId}
        lockedWardrobeLabel={lockedWardrobeLabel}
        onClearLockedWardrobe={onClearLockedWardrobe}
        lockedLocation={lockedLocation}
        onClearLockedLocation={onClearLockedLocation}
        onClearLockedVariationSeed={onClearLockedVariationSeed}
        autoFixRules={autoFixRules}
        onAutoFixRulesChange={onAutoFixRulesChange}
        activeCharacterDescriptor={activeCharacterDescriptor}
        onActiveCharacterDescriptorChange={onActiveCharacterDescriptorChange}
        selectedWorkflowId={selectedWorkflowId}
        systemWorkflowChoice={systemWorkflowChoice}
        workflowSelection={workflowSelection}
        workflowManualOverrideRef={workflowManualOverrideRef}
        onWorkflowPresetChange={onWorkflowPresetChange}
      />
    </div>
  );
}
