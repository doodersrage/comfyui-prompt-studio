'use client';

import dynamic from 'next/dynamic';
import {
  upsertCampaignTemplate,
  loadCampaignTemplates,
  deleteCampaignTemplate,
} from '@/lib/campaign-templates';
import { setActiveProjectId } from '@/lib/prompt-projects';
import { StudioTabSkeleton } from '@/components/ui/ViewState';
import type { useStudioToolOrchestration } from '@/hooks/useStudioToolOrchestration';

const StudioCampaignTab = dynamic(() => import('@/components/studio/tabs/StudioCampaignTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioAnalyticsTab = dynamic(() => import('@/components/studio/tabs/StudioAnalyticsTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioProjectsTab = dynamic(() => import('@/components/studio/tabs/StudioProjectsTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCompareTab = dynamic(() => import('@/components/studio/tabs/StudioCompareTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioPortfolioTab = dynamic(() => import('@/components/studio/tabs/StudioPortfolioTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCatalogTab = dynamic(() => import('@/components/studio/tabs/StudioCatalogTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioTemplatesTab = dynamic(() => import('@/components/studio/tabs/StudioTemplatesTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioPresetsTab = dynamic(() => import('@/components/studio/tabs/StudioPresetsTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioExperimentsTab = dynamic(
  () => import('@/components/studio/tabs/StudioExperimentsTab'),
  { loading: () => <StudioTabSkeleton /> }
);

const ACCENT = 'brand' as const;

type StudioToolViewModel = ReturnType<typeof useStudioToolOrchestration>;

export function StudioToolWorkspacePanels(vm: StudioToolViewModel) {
  const {
    tab,
    authEnabled,
    user,
    entries,
    shared,
    campaignTarget,
    campaignCount,
    campaignGenre,
    campaignTopics,
    campaignQueue,
    campaignBestOfN,
    campaignBestOfNVision,
    campaignLoading,
    campaignStatus,
    campaignResults,
    campaignTemplates,
    campaignTemplateName,
    setCampaignTarget,
    setCampaignCount,
    setCampaignGenre,
    setCampaignTopics,
    setCampaignQueue,
    setCampaignBestOfN,
    setCampaignBestOfNVision,
    setCampaignLoading,
    setCampaignStatus,
    setCampaignResults,
    setCampaignTemplateName,
    setCampaignTemplates,
    setGalleryRevision,
    historyAnalytics,
    galleryAnalytics,
    ratingTokenStats,
    galleryLineageClusters,
    setUserSceneStarters,
    projects,
    activeProjectId,
    setActiveProjectIdState,
    sharedProjects,
    projectName,
    projectNotes,
    setProjectName,
    setProjectNotes,
    setProjects,
    selectStudioTab,
    setBackupStatus,
    toolSettings,
    compareHints,
    compareA,
    compareB,
    compareLoading,
    compareError,
    visualCompareLoading,
    visualCompareStatus,
    visualA,
    visualB,
    setCompareHints,
    updateShared,
    updateToolSettings,
    runCompare,
    runVisualCompare,
    portfolioDraft,
    portfolioModels,
    portfolioItems,
    portfolioStatus,
    portfolioLoading,
    setPortfolioDraft,
    setPortfolioModels,
    setPortfolioItems,
    setPortfolioStatus,
    setPortfolioLoading,
    catalogQuery,
    catalogLoading,
    catalogError,
    catalogClothing,
    catalogLocations,
    sortedCatalogClothing,
    sortedCatalogLocations,
    blocklist,
    setBlocklist,
    loadCatalog,
    setCatalogQuery,
    template,
    filledTemplate,
    userTemplates,
    customTemplateName,
    copied,
    setCustomTemplateName,
    setUserTemplates,
    copyText,
    presetName,
    presetHints,
    presetPackName,
    sceneStarterPackName,
    identityBundleName,
    scenePresets,
    userSceneStarters,
    copiedPresetShareId,
    setPresetName,
    setPresetHints,
    setPresetPackName,
    setSceneStarterPackName,
    setIdentityBundleName,
    setScenePresets,
    setCopiedPresetShareId,
    applyIdentityBundle,
    openCharacterWithIdentity,
  } = vm;

  return (
    <>
      {tab === 'campaign' && (
        <StudioCampaignTab
          accent={ACCENT}
          shared={shared}
          campaignTarget={campaignTarget}
          campaignCount={campaignCount}
          campaignGenre={campaignGenre}
          campaignTopics={campaignTopics}
          campaignQueue={campaignQueue}
          campaignBestOfN={campaignBestOfN}
          campaignBestOfNVision={campaignBestOfNVision}
          campaignLoading={campaignLoading}
          campaignStatus={campaignStatus}
          campaignResults={campaignResults}
          campaignTemplates={campaignTemplates}
          campaignTemplateName={campaignTemplateName}
          onCampaignTargetChange={setCampaignTarget}
          onCampaignCountChange={setCampaignCount}
          onCampaignGenreChange={setCampaignGenre}
          onCampaignTopicsChange={setCampaignTopics}
          onCampaignQueueChange={setCampaignQueue}
          onCampaignBestOfNChange={setCampaignBestOfN}
          onCampaignBestOfNVisionChange={setCampaignBestOfNVision}
          onCampaignLoadingChange={setCampaignLoading}
          onCampaignStatusChange={setCampaignStatus}
          onCampaignResultsChange={setCampaignResults}
          onCampaignTemplateNameChange={setCampaignTemplateName}
          onCampaignTemplatesChange={setCampaignTemplates}
          onBackupStatusChange={setBackupStatus}
          onGalleryRevision={() => setGalleryRevision(previous => previous + 1)}
          onSaveCampaignTemplate={() => {
            upsertCampaignTemplate({
              name: campaignTemplateName.trim(),
              target: campaignTarget,
              count: campaignCount,
              genre: campaignGenre.trim() || undefined,
              topics: campaignTopics
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean),
              queueToComfyUi: campaignQueue,
            });
            setCampaignTemplates(loadCampaignTemplates());
            setCampaignTemplateName('');
            setBackupStatus('Saved campaign template.');
          }}
          onLoadCampaignTemplate={template => {
            setCampaignTarget(template.target);
            setCampaignCount(template.count);
            setCampaignGenre(template.genre ?? '');
            setCampaignTopics((template.topics ?? []).join('\n'));
            setCampaignQueue(template.queueToComfyUi);
          }}
          onDeleteCampaignTemplate={id => {
            deleteCampaignTemplate(id);
            setCampaignTemplates(loadCampaignTemplates());
          }}
        />
      )}

      {tab === 'analytics' && (
        <StudioAnalyticsTab
          accent={ACCENT}
          authEnabled={authEnabled}
          username={user?.username}
          historyAnalytics={historyAnalytics}
          galleryAnalytics={galleryAnalytics}
          ratingTokenStats={ratingTokenStats}
          galleryLineageClusters={galleryLineageClusters}
          onBackupStatusChange={setBackupStatus}
          onUserSceneStartersChange={setUserSceneStarters}
        />
      )}

      {tab === 'projects' && (
        <StudioProjectsTab
          accent={ACCENT}
          entries={entries}
          projects={projects}
          activeProjectId={activeProjectId}
          sharedProjects={sharedProjects}
          projectName={projectName}
          projectNotes={projectNotes}
          onProjectNameChange={setProjectName}
          onProjectNotesChange={setProjectNotes}
          onProjectsChange={setProjects}
          onActiveProjectChange={projectId => {
            setActiveProjectIdState(projectId);
            setActiveProjectId(projectId);
          }}
          onBackupStatusChange={setBackupStatus}
          onGalleryRevision={() => setGalleryRevision(previous => previous + 1)}
          onSelectTab={selectStudioTab}
        />
      )}

      {tab === 'compare' && (
        <StudioCompareTab
          accent={ACCENT}
          shared={shared}
          toolSettings={toolSettings}
          compareHints={compareHints}
          compareA={compareA}
          compareB={compareB}
          compareLoading={compareLoading}
          compareError={compareError}
          visualCompareLoading={visualCompareLoading}
          visualCompareStatus={visualCompareStatus}
          visualA={visualA}
          visualB={visualB}
          onCompareHintsChange={setCompareHints}
          onUpdateShared={updateShared}
          onUpdateToolSettings={updateToolSettings}
          onRunCompare={runCompare}
          onRunVisualCompare={runVisualCompare}
        />
      )}

      {tab === 'portfolio' && (
        <StudioPortfolioTab
          accent={ACCENT}
          detail={shared.detail}
          portfolioDraft={portfolioDraft}
          portfolioModels={portfolioModels}
          portfolioItems={portfolioItems}
          portfolioStatus={portfolioStatus}
          portfolioLoading={portfolioLoading}
          onPortfolioDraftChange={setPortfolioDraft}
          onPortfolioModelsChange={setPortfolioModels}
          onPortfolioItemsChange={setPortfolioItems}
          onPortfolioStatusChange={setPortfolioStatus}
          onPortfolioLoadingChange={setPortfolioLoading}
        />
      )}

      {tab === 'catalog' && (
        <StudioCatalogTab
          accent={ACCENT}
          shared={shared}
          catalogQuery={catalogQuery}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          catalogClothing={catalogClothing}
          catalogLocations={catalogLocations}
          sortedCatalogClothing={sortedCatalogClothing}
          sortedCatalogLocations={sortedCatalogLocations}
          blocklist={blocklist}
          onCatalogQueryChange={setCatalogQuery}
          onBlocklistChange={setBlocklist}
          onPresetHintsAppend={(label, kind) => {
            setPresetHints(previous =>
              kind === 'clothing'
                ? previous.trim()
                  ? `${previous.trim()}, ${label}`
                  : label
                : previous.trim()
                  ? `${previous.trim()}, location: ${label}`
                  : `location: ${label}`
            );
          }}
          onBackupStatusChange={setBackupStatus}
          onUpdateShared={updateShared}
          onLoadCatalog={loadCatalog}
        />
      )}

      {tab === 'templates' && (
        <StudioTemplatesTab
          accent={ACCENT}
          toolSettings={toolSettings}
          template={template}
          filledTemplate={filledTemplate}
          userTemplates={userTemplates}
          customTemplateName={customTemplateName}
          copied={copied}
          onCustomTemplateNameChange={setCustomTemplateName}
          onUserTemplatesChange={setUserTemplates}
          onUpdateToolSettings={updateToolSettings}
          onBackupStatusChange={setBackupStatus}
          onCopy={copyText}
        />
      )}

      {tab === 'presets' && (
        <StudioPresetsTab
          accent={ACCENT}
          shared={shared}
          toolSettings={toolSettings}
          compareHints={compareHints}
          filledTemplate={filledTemplate}
          presetName={presetName}
          presetHints={presetHints}
          presetPackName={presetPackName}
          sceneStarterPackName={sceneStarterPackName}
          identityBundleName={identityBundleName}
          scenePresets={scenePresets}
          userSceneStarters={userSceneStarters}
          copiedPresetShareId={copiedPresetShareId}
          onPresetNameChange={setPresetName}
          onPresetHintsChange={setPresetHints}
          onPresetPackNameChange={setPresetPackName}
          onSceneStarterPackNameChange={setSceneStarterPackName}
          onIdentityBundleNameChange={setIdentityBundleName}
          onScenePresetsChange={setScenePresets}
          onUserSceneStartersChange={setUserSceneStarters}
          onCompareHintsChange={setCompareHints}
          onCopiedPresetShareIdChange={setCopiedPresetShareId}
          onUpdateShared={updateShared}
          onUpdateToolSettings={updateToolSettings}
          onBackupStatusChange={setBackupStatus}
          onApplyIdentityBundle={applyIdentityBundle}
          onOpenCharacterWithIdentity={openCharacterWithIdentity}
        />
      )}

      {tab === 'experiments' && <StudioExperimentsTab />}
    </>
  );
}
