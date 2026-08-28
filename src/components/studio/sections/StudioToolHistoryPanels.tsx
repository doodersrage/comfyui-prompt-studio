'use client';

import dynamic from 'next/dynamic';
import { setActiveProjectId } from '@/lib/prompt-projects';
import { templateFromPrompt, upsertUserTemplate, loadUserTemplates } from '@/lib/user-templates';
import { StudioTabSkeleton } from '@/components/ui/ViewState';
import type { useStudioToolOrchestration } from '@/hooks/useStudioToolOrchestration';

const StudioDiffTab = dynamic(() => import('@/components/studio/tabs/StudioDiffTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioHistoryTab = dynamic(() => import('@/components/studio/tabs/StudioHistoryTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioIterationTab = dynamic(() => import('@/components/studio/tabs/StudioIterationTab'), {
  loading: () => <StudioTabSkeleton />,
});

const ACCENT = 'brand' as const;

type StudioToolViewModel = ReturnType<typeof useStudioToolOrchestration>;

export function StudioToolHistoryPanels(vm: StudioToolViewModel) {
  const {
    tab,
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
    selectStudioTab,
    setUserTemplates,
    iterationForest,
    iterationEntries,
    iterationDiffLeftId,
    iterationDiffRightId,
    iterationDiff,
    setIterationDiffLeftId,
    setIterationDiffRightId,
    setHighlightHistoryId,
    diffLeftId,
    diffRightId,
    diffLeft,
    diffRight,
    promptDiff,
  } = vm;

  return (
    <>
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
    </>
  );
}
