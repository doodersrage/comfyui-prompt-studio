'use client';

import { workflowFileDisplayName } from '@/lib/comfyui-workflow-files';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';
import type { ComfyWorkflowFile } from '@/lib/comfyui-workflow-files';
import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';
import { EmptyState } from '@/components/ui/ViewState';
import { ComfyWorkflowServerListSection } from '@/components/comfy-workflow/sections/ComfyWorkflowServerListSection';
import {
  ComfyWorkflowEditPanel,
  ComfyWorkflowImportedRow,
} from '@/components/comfy-workflow/sections/ComfyWorkflowImportedListSection';

type Props = ComfyWorkflowLibraryViewModel;

export function ComfyWorkflowLibraryListSection(props: Props) {
  const {
    placeholderTokens,
    files,
    serverFiles,
    selectedId,
    editingId,
    editingName,
    setEditingName,
    editingJson,
    setEditingJson,
    editingTokens,
    editError,
    setEditError,
    bindingPreview,
    editingValidation,
    editingNodeMappings,
    editingGraphInspect,
    selectFile,
    startEdit,
    persistEditingTokens,
    assignInferredModels,
    cancelEdit,
    saveEdit,
    optimizeAndSaveCopy,
    optimizeAllInLibrary,
    removeFile,
    copyBindingHints,
    applyBindings,
  } = props;

  return (
    <>
      <ComfyWorkflowServerListSection
        serverFiles={serverFiles}
        selectedId={selectedId ?? null}
        selectFile={selectFile}
      />

      <div className="space-y-2">
        <p className="type-overline">Imported workflow files ({files.length})</p>
        {files.length === 0 ? (
          <EmptyState
            branded
            icon="catalog"
            title="No workflow files yet"
            description="Export workflows from ComfyUI (Save → API format) and import them here to bind tokens and queue from Studio tools."
          />
        ) : (
          <ul className="ui-list">
            {files.map((file: ComfyWorkflowFile) => {
              const active = selectedId === file.id;
              const isEditing = editingId === file.id;
              const displayName = workflowFileDisplayName(file);
              const inferredModels = inferModelsFromWorkflowLabel({
                name: file.name,
                filename: file.filename,
              });
              return (
                <ComfyWorkflowImportedRow
                  key={file.id}
                  file={file}
                  active={active}
                  isEditing={isEditing}
                  displayName={displayName}
                  inferredModels={inferredModels}
                  selectFile={selectFile}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  removeFile={removeFile}
                  assignInferredModels={assignInferredModels}
                  editPanel={
                    <ComfyWorkflowEditPanel
                      file={file}
                      displayName={displayName}
                      placeholderTokens={placeholderTokens}
                      editingName={editingName}
                      setEditingName={setEditingName}
                      editingJson={editingJson}
                      setEditingJson={setEditingJson}
                      editingTokens={editingTokens}
                      editError={editError}
                      setEditError={setEditError}
                      bindingPreview={bindingPreview}
                      editingValidation={editingValidation}
                      editingNodeMappings={editingNodeMappings}
                      editingGraphInspect={editingGraphInspect}
                      persistEditingTokens={persistEditingTokens}
                      cancelEdit={cancelEdit}
                      saveEdit={saveEdit}
                      optimizeAndSaveCopy={optimizeAndSaveCopy}
                      optimizeAllInLibrary={optimizeAllInLibrary}
                      copyBindingHints={copyBindingHints}
                      applyBindings={applyBindings}
                    />
                  }
                />
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Server env: set <code className="ui-inline-code">COMFYUI_WORKFLOW_DIR</code> or{' '}
        <code className="ui-inline-code">COMFYUI_WORKFLOW_PATHS</code> to expose additional JSON
        files from disk.
      </p>
    </>
  );
}
