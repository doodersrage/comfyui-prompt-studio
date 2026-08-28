'use client';

import {
  getWorkflowTokenValue,
  setWorkflowTokenValue,
  workflowFileDisplayName,
  workflowFileSourceFilename,
  WORKFLOW_TOKEN_FIELDS,
} from '@/lib/comfyui-workflow-files';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';
import ComfyPackImportControl from '@/components/ComfyPackImportControl';
import { Button } from '@/components/ui/Button';
import { ChipButton, MonoTextArea, SelectInput, TextInput } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';

export default function ComfyWorkflowLibrarySections({
  placeholderTokens,
  files,
  serverFiles,
  selectedId,
  newName,
  setNewName,
  editingId,
  editingName,
  setEditingName,
  editingJson,
  setEditingJson,
  editingTokens,
  editError,
  setEditError,
  importError,
  importErrorDetail,
  importNotice,
  optimizePreviewSummary,
  presetPacks,
  packName,
  setPackName,
  activePackId,
  setActivePackId,
  bindingPreview,
  editingValidation,
  editingNodeMappings,
  editingGraphInspect,
  selectFile,
  startEdit,
  persistEditingTokens,
  assignInferredModels,
  importFile,
  cancelEdit,
  saveEdit,
  createBlank,
  createScaffoldForModel,
  createControlNetScaffold,
  createFaceDetailerScaffold,
  createIdentityScaffold,
  cloneAndBindWorkflow,
  previewOptimizeCopy,
  optimizeAndSaveCopy,
  optimizeAllInLibrary,
  removeFile,
  handlePackImport,
  createNewPack,
  importPresetPackFile,
  addSelectedWorkflowToPack,
  saveCurrentSettingsToPack,
  installPresetPack,
  exportPresetPack,
  copyBindingHints,
  applyBindings,
}: ComfyWorkflowLibraryViewModel) {
  return (
    <section className="ui-meta-panel space-y-4">
      <div className="space-y-1">
        <h2 className="type-heading">ComfyUI workflow library</h2>
        <p className="type-caption">
          Manage multiple ComfyUI API workflow JSON files. Pick the active file from the dropdown
          next to{' '}
          <strong className="font-medium text-[var(--text-secondary)]">Send to ComfyUI</strong> on
          any result panel. URL, tokens, and queue params still come from the connection settings
          below (or server env).
        </p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <p className="type-heading mb-2">Import Comfy pack</p>
        <ComfyPackImportControl onImported={handlePackImport} />
      </div>

      <ToolActionRow>
        <TextInput
          value={newName}
          onChange={event => setNewName(event.target.value)}
          placeholder="Name for new/imported workflow"
          className="min-w-[14rem] flex-1"
        />
        <label className="ui-file-input-label ui-btn-secondary ui-btn-sm">
          Import .json
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) {
                void importFile(file);
              }
              event.target.value = '';
            }}
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={createBlank}>
          New workflow
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createScaffoldForModel}>
          Scaffold for model
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createControlNetScaffold}>
          ControlNet scaffold
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createFaceDetailerScaffold}>
          FaceDetailer scaffold
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => createIdentityScaffold('instantid')}
        >
          InstantID scaffold
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => createIdentityScaffold('pulid')}
        >
          PuLID scaffold
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={cloneAndBindWorkflow}
          disabled={!editingJson.trim()}
        >
          Clone &amp; bind
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={previewOptimizeCopy}
          disabled={!editingJson.trim()}
        >
          Preview optimize
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={optimizeAndSaveCopy}
          disabled={!editingJson.trim()}
        >
          Optimize &amp; save copy
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={optimizeAllInLibrary}>
          Optimize all in library
        </Button>
        <ChipButton active={!selectedId} onClick={() => selectFile(undefined, '')}>
          Use fallback default
        </ChipButton>
      </ToolActionRow>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        After importing community JSON, run{' '}
        <strong className="font-medium text-[var(--text-muted)]">Optimize all in library</strong> so
        placeholders bind to your checkpoint/VAE maps and queue can skip re-bind/enrich via a fresh
        hash. Confirm filenames match ComfyUI&apos;s model lists. Workflow Health flags missing or
        stale optimize hashes.
      </p>

      {importError ? (
        <div
          className="space-y-1 rounded-xl border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-3 py-2.5"
          role="alert"
        >
          <p className="type-caption ui-status-danger">{importError}</p>
          {importErrorDetail ? (
            <p className="type-caption whitespace-pre-wrap ui-status-danger opacity-80">
              {importErrorDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {importNotice ? (
        <p className="type-caption text-[var(--tint-warning-text)]">{importNotice}</p>
      ) : null}
      {optimizePreviewSummary ? (
        <p className="type-caption text-[var(--accent-text)]">{optimizePreviewSummary}</p>
      ) : null}

      {serverFiles.length > 0 && (
        <div className="space-y-2">
          <p className="type-overline">Server workflow files</p>
          <ul className="ui-list">
            {serverFiles.map(entry => {
              const active = selectedId === entry.id;
              return (
                <li
                  key={entry.id}
                  className="ui-list-row"
                  data-highlight={active ? 'true' : undefined}
                >
                  <div className="ui-list-primary min-w-0">
                    <p className="type-heading">{entry.name}</p>
                    <p className="type-caption">Server workflow</p>
                  </div>
                  <Button
                    type="button"
                    variant={active ? 'accent-outline' : 'secondary'}
                    size="sm"
                    onClick={() => selectFile(entry.id, entry.name)}
                  >
                    {active ? 'Selected' : 'Use for Send'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
            {files.map(file => {
              const active = selectedId === file.id;
              const isEditing = editingId === file.id;
              const displayName = workflowFileDisplayName(file);
              const sourceFilename = workflowFileSourceFilename(file);
              const inferredModels = inferModelsFromWorkflowLabel({
                name: file.name,
                filename: file.filename,
              });
              return (
                <li
                  key={file.id}
                  className="ui-list-row flex-col items-stretch !min-h-0 !items-start gap-0 !p-0"
                  data-highlight={active ? 'true' : undefined}
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="type-heading">
                        {displayName}
                        {active && (
                          <span className="ml-2 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent-text)]">
                            Active
                          </span>
                        )}
                      </p>
                      <p className="type-caption">
                        {sourceFilename ? `${sourceFilename} · ` : ''}
                        {new Date(file.createdAt).toLocaleString()} ·{' '}
                        {(file.workflowJson.length / 1024).toFixed(1)} KB
                        {file.customTokens && file.customTokens.length > 0
                          ? ` · ${file.customTokens.length} token override${file.customTokens.length === 1 ? '' : 's'}`
                          : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {inferredModels.length > 0 ? (
                          <>
                            <p className="type-caption text-[var(--accent-text)] opacity-80">
                              Suggested: {inferredModels.join(', ')}
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => assignInferredModels(file.id, inferredModels, true)}
                            >
                              Assign to models
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => assignInferredModels(file.id, inferredModels, false)}
                              title="Only fill models that have no mapping yet"
                            >
                              Fill empty only
                            </Button>
                          </>
                        ) : (
                          <p className="type-caption text-[var(--text-muted)]">
                            No model inferred from the name — assign manually:
                          </p>
                        )}
                        <SelectInput
                          aria-label={`Manually assign ${displayName} to a model`}
                          className="max-w-[16rem] text-xs"
                          defaultValue=""
                          onChange={event => {
                            const modelId = event.target.value.trim();
                            if (!modelId) {
                              return;
                            }
                            assignInferredModels(file.id, [modelId], true);
                            event.target.value = '';
                          }}
                        >
                          <option value="">Assign to model…</option>
                          {COMFY_IMAGE_MODELS.map(model => (
                            <option key={model.id} value={model.id}>
                              {model.id}
                            </option>
                          ))}
                        </SelectInput>
                      </div>
                    </div>
                    <ToolActionRow>
                      <Button
                        type="button"
                        variant={active ? 'accent-outline' : 'secondary'}
                        size="sm"
                        onClick={() => selectFile(file.id, displayName)}
                      >
                        {active ? 'Selected' : 'Use for Send'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => (isEditing ? cancelEdit() : startEdit(file))}
                      >
                        {isEditing ? 'Close' : 'Edit JSON'}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                      >
                        Delete
                      </Button>
                    </ToolActionRow>
                  </div>
                  {isEditing && (
                    <div className="ui-surface-inset mx-4 mb-4 mt-0 space-y-3 border-t-0">
                      <label className="block space-y-2">
                        <span className="type-caption">Display name</span>
                        <TextInput
                          value={editingName}
                          onChange={event => setEditingName(event.target.value)}
                        />
                      </label>
                      <div className="space-y-3 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 p-3">
                        <div>
                          <p className="type-caption text-[var(--text-secondary)]">
                            Per-workflow token overrides
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Unique to this workflow. Beat Settings → LoRA library and the global
                            checkpoint map when this file is selected for Send. Token overrides save
                            as you type.
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {WORKFLOW_TOKEN_FIELDS.map(field => (
                            <label key={field.token} className="block space-y-1.5">
                              <span className="type-caption">
                                {field.label}{' '}
                                <code className="text-[10px] text-[var(--accent-text)]">
                                  {field.token}
                                </code>
                              </span>
                              <TextInput
                                value={getWorkflowTokenValue(editingTokens, field.token)}
                                onChange={event =>
                                  persistEditingTokens(
                                    setWorkflowTokenValue(
                                      editingTokens,
                                      field.token,
                                      event.target.value
                                    )
                                  )
                                }
                                placeholder={field.hint}
                                className="font-mono text-xs"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="block space-y-2">
                        <span className="type-caption">Workflow JSON (ComfyUI API format)</span>
                        <MonoTextArea
                          value={editingJson}
                          onChange={event => {
                            setEditingJson(event.target.value);
                            setEditError(null);
                          }}
                          rows={14}
                          spellCheck={false}
                          className="text-[var(--tint-success-text)]"
                        />
                      </label>
                      {editingGraphInspect?.ok ? (
                        <div className="ui-surface-inset space-y-2">
                          <p className="type-caption text-[var(--accent-text)]">
                            Graph inspector · {editingGraphInspect.nodeCount} nodes
                          </p>
                          <p className="type-caption text-[var(--text-muted)]">
                            {editingGraphInspect.classCounts
                              .slice(0, 8)
                              .map(entry => `${entry.classType}×${entry.count}`)
                              .join(' · ')}
                            {editingGraphInspect.classCounts.length > 8
                              ? ` · +${editingGraphInspect.classCounts.length - 8} more`
                              : ''}
                          </p>
                          {editingGraphInspect.unresolvedTokens.length > 0 ? (
                            <p className="type-caption text-[var(--tint-warning-text)]">
                              Unresolved tokens:{' '}
                              {editingGraphInspect.unresolvedTokens.slice(0, 12).join(' ')}
                              {editingGraphInspect.unresolvedTokens.length > 12 ? '…' : ''}
                            </p>
                          ) : (
                            <p className="type-caption text-[var(--text-muted)]">
                              No {'{{TOKEN}}'} placeholders in this JSON.
                            </p>
                          )}
                        </div>
                      ) : null}
                      {editError && <p className="text-xs ui-status-danger">{editError}</p>}
                      {editingValidation && (
                        <p className="text-xs text-[var(--text-muted)]">
                          {editingValidation.ok ? (
                            <>
                              Placeholders: {editingValidation.placeholders?.positive ?? 0}×{' '}
                              {placeholderTokens.positive}
                              {(editingValidation.placeholders?.negative ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.negative}× ${placeholderTokens.negative}`
                                : ''}
                              {(editingValidation.placeholders?.seed ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.seed}× ${placeholderTokens.seed}`
                                : ''}
                              {(editingValidation.placeholders?.width ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.width}× ${placeholderTokens.width}`
                                : ''}
                              {(editingValidation.placeholders?.height ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.height}× ${placeholderTokens.height}`
                                : ''}
                              {(editingValidation.placeholders?.cfg ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.cfg}× ${placeholderTokens.cfg}`
                                : ''}
                              {(editingValidation.placeholders?.steps ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.steps}× ${placeholderTokens.steps}`
                                : ''}
                            </>
                          ) : (
                            <span className="text-[var(--tint-warning-text)]">
                              {editingValidation.error}
                            </span>
                          )}
                        </p>
                      )}
                      {editingNodeMappings.length > 0 ? (
                        <div className="ui-surface-inset">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="type-caption text-[var(--accent-text)]">
                              Suggested node bindings
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={copyBindingHints}
                            >
                              Copy hints
                            </Button>
                            <Button
                              type="button"
                              variant="accent-outline"
                              size="sm"
                              onClick={applyBindings}
                            >
                              Apply bindings
                            </Button>
                          </div>
                          {bindingPreview ? (
                            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-2 text-[11px] text-[var(--text-muted)]">
                              {bindingPreview}
                            </pre>
                          ) : null}
                          <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                            {editingNodeMappings.map(mapping => (
                              <li key={mapping.nodeId}>
                                <span className="text-[var(--text-primary)]">{mapping.nodeId}</span>{' '}
                                · {mapping.classType}
                                {mapping.suggestedBinding ? ` → ${mapping.suggestedBinding}` : ''}
                                <span className="text-[var(--text-muted)]">
                                  {' '}
                                  — {mapping.reason}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <ToolActionRow>
                        <Button type="button" variant="primary" size="sm" onClick={saveEdit}>
                          Save workflow
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={optimizeAndSaveCopy}
                        >
                          Optimize &amp; save copy
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={optimizeAllInLibrary}
                        >
                          Optimize all in library
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </ToolActionRow>
                    </div>
                  )}
                </li>
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

      <div className="ui-surface-inset space-y-3">
        <h3 className="type-heading">Workflow preset packs</h3>
        <p className="type-caption">
          Bundle saved workflow presets for import/export between browsers or team members.
        </p>
        <ToolActionRow>
          <TextInput
            value={packName}
            onChange={event => setPackName(event.target.value)}
            placeholder="Pack name"
            className="min-w-[180px] flex-1"
          />
          <Button type="button" variant="secondary" size="sm" onClick={createNewPack}>
            New pack
          </Button>
          <label className="ui-file-input-label ui-btn-secondary ui-btn-sm">
            Import pack
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                importPresetPackFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </ToolActionRow>
        {presetPacks.length === 0 ? (
          <EmptyState
            compact
            icon="preset"
            title="No preset packs yet"
            description="Create a pack above to group workflow presets for export, import, and reuse across machines."
          />
        ) : (
          <>
            <label className="block space-y-2">
              <span className="type-caption">Active pack for saving</span>
              <SelectInput
                value={activePackId}
                onChange={event => setActivePackId(event.target.value)}
              >
                <option value="">Select pack…</option>
                {presetPacks.map(pack => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name} ({pack.presets.length})
                  </option>
                ))}
              </SelectInput>
            </label>
            <ToolActionRow>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!activePackId || !selectedId}
                onClick={addSelectedWorkflowToPack}
              >
                Add selected workflow to pack
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!activePackId}
                onClick={saveCurrentSettingsToPack}
              >
                Save current settings to pack
              </Button>
            </ToolActionRow>
            <ul className="ui-list">
              {presetPacks.map(pack => (
                <li key={pack.id} className="ui-list-row text-xs">
                  <span className="ui-list-primary type-caption">
                    {pack.name} · {pack.presets.length} preset(s)
                  </span>
                  <ToolActionRow>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pack.presets.length === 0}
                      onClick={() => installPresetPack(pack)}
                    >
                      Install
                    </Button>
                    <Button
                      type="button"
                      variant="accent-outline"
                      size="sm"
                      onClick={() => exportPresetPack(pack)}
                    >
                      Export
                    </Button>
                  </ToolActionRow>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
