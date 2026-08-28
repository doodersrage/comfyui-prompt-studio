'use client';

import dynamic from 'next/dynamic';
import {
  upsertCampaignTemplate,
  loadCampaignTemplates,
  deleteCampaignTemplate,
} from '@/lib/campaign-templates';
import { templateFromPrompt, upsertUserTemplate, loadUserTemplates } from '@/lib/user-templates';
import { setActiveProjectId } from '@/lib/prompt-projects';
import { ToolBadge, ToolLayout, ToolMetaPanel } from '@/components/ui/ToolPageShell';
import { ChipButton } from '@/components/ui/Field';
import { StudioTabSkeleton } from '@/components/ui/ViewState';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import type { useStudioToolOrchestration } from '@/hooks/useStudioToolOrchestration';

const StudioDiffTab = dynamic(() => import('@/components/studio/tabs/StudioDiffTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioPortfolioTab = dynamic(() => import('@/components/studio/tabs/StudioPortfolioTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioHistoryTab = dynamic(() => import('@/components/studio/tabs/StudioHistoryTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCompareTab = dynamic(() => import('@/components/studio/tabs/StudioCompareTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioExperimentsTab = dynamic(
  () => import('@/components/studio/tabs/StudioExperimentsTab'),
  { loading: () => <StudioTabSkeleton /> }
);
const StudioIterationTab = dynamic(() => import('@/components/studio/tabs/StudioIterationTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCampaignTab = dynamic(() => import('@/components/studio/tabs/StudioCampaignTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioAnalyticsTab = dynamic(() => import('@/components/studio/tabs/StudioAnalyticsTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioProjectsTab = dynamic(() => import('@/components/studio/tabs/StudioProjectsTab'), {
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

const ACCENT = 'brand' as const;

type StudioToolViewModel = ReturnType<typeof useStudioToolOrchestration>;

type StudioToolSectionsProps = StudioToolViewModel & { description: string };

export default function StudioToolSections({ description, ...vm }: StudioToolSectionsProps) {
  const {
    mounted,
    isNullContext,
    tabGroups,
    tab,
    selectStudioTab,
    authEnabled,
    user,
    entries,
    filteredEntries,
    favoriteEntries,
    historyFilter,
    setHistoryFilter,
    projects,
    activeProjectId,
    setActiveProjectIdState,
    backupStatus,
    setBackupStatus,
    actions,
    highlightHistoryId,
    copyText,
    toggleFavorite,
    setRating,
    addTag,
    removeEntry,
    removeEntries,
    addTagToEntries,
    clearHistory,
    handleImportBackup,
    setDiffLeftId,
    setDiffRightId,
    setUserTemplates,
    iterationForest,
    iterationEntries,
    iterationDiffLeftId,
    iterationDiffRightId,
    iterationDiff,
    setIterationDiffLeftId,
    setIterationDiffRightId,
    setHighlightHistoryId,
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
    sharedProjects,
    projectName,
    projectNotes,
    setProjectName,
    setProjectNotes,
    setProjects,
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
    toolSettings,
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
    diffLeftId,
    diffRightId,
    diffLeft,
    diffRight,
    promptDiff,
  } = vm;

  if (!mounted) {
    return (
      <ToolLayout
        accent={ACCENT}
        width="wide"
        badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
        title="Prompt Studio"
        description={description}
      >
        <StudioTabSkeleton />
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
      title="Prompt Studio"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.studio} />
      {/* Null-context guard — provider not yet wired up during hydration/HMR. */}
      {isNullContext ? null : (
        <div className="flex h-full flex-col gap-4">
          <ToolMetaPanel title="Studio views" className="overflow-x-auto">
            <div className="flex min-w-max flex-wrap items-start gap-x-8 gap-y-5">
              {tabGroups.map(group => (
                <div key={group.label} className="space-y-2.5">
                  <p className="type-overline text-[var(--text-muted)]">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.tabs.map(entry => (
                      <ChipButton
                        key={entry.id}
                        active={tab === entry.id}
                        onClick={() => selectStudioTab(entry.id)}
                      >
                        {entry.label}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ToolMetaPanel>

          {tab === 'history' && (
            <StudioHistoryTab
              accent={ACCENT}
              entries={entries}
              filteredEntries={filteredEntries}
              favoriteEntries={favoriteEntries}
              historyFilter={historyFilter}
              onHistoryFilterChange={setHistoryFilter}
              projects={projects}
              activeProjectId={activeProjectId}
              onActiveProjectChange={projectId => {
                setActiveProjectIdState(projectId);
                setActiveProjectId(projectId);
              }}
              backupStatus={backupStatus}
              onBackupStatusChange={setBackupStatus}
              comfyUiStatus={actions.comfyUiStatus}
              highlightHistoryId={highlightHistoryId}
              onCopy={copyText}
              onToggleFavorite={toggleFavorite}
              onRate={setRating}
              onAddTag={addTag}
              onRemoveEntry={removeEntry}
              onRemoveEntries={removeEntries}
              onAddTagToEntries={addTagToEntries}
              onClearHistory={clearHistory}
              onImportBackup={handleImportBackup}
              onDiffLeft={id => {
                setDiffLeftId(id);
                selectStudioTab('diff');
              }}
              onDiffRight={id => {
                setDiffRightId(id);
                selectStudioTab('diff');
              }}
              onSaveTemplateFromEntry={entry => {
                const name = window.prompt('Template name', `${entry.tool} prompt`);
                if (!name?.trim()) {
                  return;
                }
                const created = templateFromPrompt(name.trim(), entry.prompt);
                upsertUserTemplate(created);
                setUserTemplates(loadUserTemplates());
                setBackupStatus(`Saved template “${created.label}”.`);
              }}
              onSendBatchFavorites={prompts => void actions.sendBatchComfyUi(prompts)}
            />
          )}

          {tab === 'iteration' && (
            <StudioIterationTab
              accent={ACCENT}
              entries={entries}
              iterationForest={iterationForest}
              iterationEntries={iterationEntries}
              iterationDiffLeftId={iterationDiffLeftId}
              iterationDiffRightId={iterationDiffRightId}
              iterationDiff={iterationDiff}
              highlightHistoryId={highlightHistoryId}
              onIterationDiffLeftIdChange={setIterationDiffLeftId}
              onIterationDiffRightIdChange={setIterationDiffRightId}
              onHighlightHistoryIdChange={setHighlightHistoryId}
              onBackupStatusChange={setBackupStatus}
              onDiffWithParent={(parentId, childId) => {
                setIterationDiffLeftId(parentId);
                setIterationDiffRightId(childId);
              }}
            />
          )}

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

          {tab === 'diff' && (
            <StudioDiffTab
              entries={entries}
              diffLeftId={diffLeftId}
              diffRightId={diffRightId}
              onDiffLeftIdChange={setDiffLeftId}
              onDiffRightIdChange={setDiffRightId}
              diffLeft={diffLeft}
              diffRight={diffRight}
              promptDiff={promptDiff}
              onSelectTab={selectStudioTab}
            />
          )}
        </div>
      )}
    </ToolLayout>
  );
}
