"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { prepareWorkflowJsonImport } from "@/lib/workflow-import";
import {
  validateWorkflowJson,
  type WorkflowPlaceholderTokens,
} from "@/lib/comfyui-config";
import {
  deleteComfyWorkflowFile,
  loadComfyWorkflowFiles,
  upsertComfyWorkflowFile,
  workflowFileDisplayName,
  workflowFileNameFromPath,
  workflowFileSourceFilename,
  type ComfyWorkflowFile,
} from "@/lib/comfyui-workflow-files";
import {
  clearSelectedWorkflowFileIfDeleted,
  getSelectedWorkflowFileId,
  setSelectedWorkflowFileId,
} from "@/lib/comfyui-runtime";
import {
  addPresetsToPack,
  applyWorkflowPresetPackToLibrary,
  exportWorkflowPresetPack,
  importWorkflowPresetPack,
  loadWorkflowPresetPacks,
  upsertWorkflowPresetPack,
  workflowFileToPreset,
  type WorkflowPresetPack,
} from "@/lib/workflow-preset-packs";
import { suggestWorkflowNodeMappings } from "@/lib/workflow-node-mapper";
import {
  applyWorkflowNodeBindings,
  summarizeBindingChanges,
} from "@/lib/workflow-apply-bindings";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { markOnboardingWorkflowImported } from "@/lib/onboarding-hooks";
import { loadSettingsCache, saveSharedSettings } from "@/lib/settings-cache";
import { resolveQueueParams } from "@/lib/queue-params-settings";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import {
  scaffoldWorkflowForModel,
  suggestedScaffoldName,
} from "@/lib/workflow-scaffold";
import { inferModelsFromWorkflowLabel } from "@/lib/workflow-category-defaults";
import { assignWorkflowToInferredModels } from "@/lib/model-workflow-map";
import {
  optimizeWorkflowForQueue,
  suggestedOptimizedWorkflowName,
} from "@/lib/workflow-queue-optimizer";
import { optimizeAllWorkflowsInLibrary } from "@/lib/workflow-library-batch";
import type { ServerWorkflowOption } from "@/hooks/useComfyWorkflowSelection";
import { Button } from "@/components/ui/Button";
import { ChipButton, MonoTextArea, SelectInput, TextInput } from "@/components/ui/Field";
import { ToolActionRow } from "@/components/ui/ToolPageShell";

type ComfyWorkflowLibraryPanelProps = {
  placeholderTokens: WorkflowPlaceholderTokens;
  onStatus?: (message: string) => void;
};

export default function ComfyWorkflowLibraryPanel({
  placeholderTokens,
  onStatus,
}: ComfyWorkflowLibraryPanelProps) {
  const [files, setFiles] = useState<ComfyWorkflowFile[]>([]);
  const [serverFiles, setServerFiles] = useState<ServerWorkflowOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingJson, setEditingJson] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetail, setImportErrorDetail] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [presetPacks, setPresetPacks] = useState<WorkflowPresetPack[]>([]);
  const [packName, setPackName] = useState("");
  const [activePackId, setActivePackId] = useState("");
  const [bindingPreview, setBindingPreview] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setFiles(loadComfyWorkflowFiles());
    setSelectedId(getSelectedWorkflowFileId());
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refresh();
      setPresetPacks(loadWorkflowPresetPacks());
      void fetch("/api/comfyui/workflows")
        .then((response) => response.json())
        .then((data: { workflows?: ServerWorkflowOption[] }) => {
          setServerFiles(data.workflows ?? []);
        })
        .catch(() => {
          setServerFiles([]);
        });
    });
  }, [refresh]);

  const editingValidation = useMemo(() => {
    if (!editingJson.trim()) {
      return null;
    }
    return validateWorkflowJson(editingJson, placeholderTokens);
  }, [editingJson, placeholderTokens]);

  const editingNodeMappings = useMemo(() => {
    if (!editingJson.trim()) {
      return [];
    }
    return suggestWorkflowNodeMappings(editingJson);
  }, [editingJson]);

  const startEdit = useCallback((file: ComfyWorkflowFile) => {
    setEditingId(file.id);
    setEditingName(file.name);
    setEditingJson(file.workflowJson);
    setEditError(null);
  }, []);

  const assignInferredModels = useCallback(
    (workflowId: string, models: ReturnType<typeof inferModelsFromWorkflowLabel>, overwrite = false) => {
      if (models.length === 0) {
        onStatus?.("No suggested models for this workflow label.");
        return;
      }
      const shared = loadSettingsCache().shared;
      const nextMap = assignWorkflowToInferredModels(workflowId, models, shared.modelWorkflowMap, overwrite);
      saveSharedSettings({ ...shared, modelWorkflowMap: nextMap });
      onStatus?.(`Assigned workflow to ${models.length} model(s): ${models.join(", ")}`);
    },
    [onStatus],
  );

  const importFile = useCallback(
    async (file: File) => {
      setImportError(null);
      setImportErrorDetail(null);
      setImportNotice(null);
      try {
        const raw = await file.text();
        const prepared = prepareWorkflowJsonImport(raw, placeholderTokens);
        if (!prepared.ok || !prepared.workflowJson) {
          setImportError(prepared.error ?? "Invalid workflow JSON.");
          setImportErrorDetail(prepared.errorDetail ?? null);
          return;
        }

        const saved = upsertComfyWorkflowFile({
          name:
            newName.trim() ||
            workflowFileNameFromPath(file.name) ||
            `Workflow ${new Date().toLocaleString()}`,
          filename: file.name,
          workflowJson: prepared.workflowJson,
        });
        refresh();
        setNewName("");
        setSelectedWorkflowFileId(saved.id);
        setSelectedId(saved.id);
        startEdit(saved);
        const inferred = inferModelsFromWorkflowLabel({
          name: saved.name,
          filename: saved.filename,
        });
        setImportNotice(
          [prepared.notice, inferred.length ? `Suggested models: ${inferred.join(", ")}` : null]
            .filter(Boolean)
            .join(" · ") || null,
        );
        onStatus?.(
          `Imported “${saved.filename ?? saved.name}” · ${prepared.placeholders?.positive ?? 0}× ${placeholderTokens.positive}`,
        );
        markOnboardingWorkflowImported();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed.";
        setImportError(message);
        onStatus?.(message);
      }
    },
    [assignInferredModels, newName, onStatus, placeholderTokens, refresh, startEdit],
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
    setEditingJson("");
    setEditError(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) {
      return;
    }

    const validation = validateWorkflowJson(editingJson, placeholderTokens);
    if (!validation.ok) {
      setEditError(validation.error ?? "Invalid workflow JSON.");
      return;
    }

    const existing = files.find((entry) => entry.id === editingId);
    const saved = upsertComfyWorkflowFile({
      id: editingId,
      createdAt: existing?.createdAt,
      filename: existing?.filename,
      name: editingName.trim() || existing?.name || "Workflow",
      workflowJson: editingJson.trim(),
    });
    refresh();
    cancelEdit();
    onStatus?.(`Saved workflow “${saved.name}”.`);
  }, [
    cancelEdit,
    editingId,
    editingJson,
    editingName,
    files,
    onStatus,
    placeholderTokens,
    refresh,
  ]);

  const createBlank = useCallback(() => {
    const template = `{
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "${placeholderTokens.positive}",
      "clip": ["4", 0]
    }
  }
}`;
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || `Workflow ${files.length + 1}`,
      workflowJson: template,
    });
    refresh();
    setNewName("");
    startEdit(saved);
    onStatus?.(`Created workflow “${saved.name}”. Edit the JSON below.`);
  }, [files.length, newName, onStatus, placeholderTokens.positive, refresh, startEdit]);

  const createScaffoldForModel = useCallback(() => {
    const model = loadSettingsCache().shared.model;
    const result = scaffoldWorkflowForModel(model, {
      tokens: {
        positive: placeholderTokens.positive,
        negative: placeholderTokens.negative,
        seed: placeholderTokens.seed,
        width: placeholderTokens.width,
        height: placeholderTokens.height,
        cfg: placeholderTokens.cfg,
        steps: placeholderTokens.steps,
        sampler: placeholderTokens.sampler,
        scheduler: placeholderTokens.scheduler,
        shift: placeholderTokens.shift,
        fluxMaxShift: placeholderTokens.fluxMaxShift,
        fluxBaseShift: placeholderTokens.fluxBaseShift,
        denoise: placeholderTokens.denoise,
        inputImage: placeholderTokens.inputImage,
        maskImage: placeholderTokens.maskImage,
      },
    });
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || suggestedScaffoldName(model, "template"),
      workflowJson: result.json,
    });
    refresh();
    setNewName("");
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    onStatus?.(
      `Created ${result.category} scaffold for ${model} · assigned to model map. ${result.notes[0] ?? ""}`.trim(),
    );
  }, [assignInferredModels, newName, onStatus, placeholderTokens, refresh, startEdit]);

  const cloneAndBindWorkflow = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.("Select a workflow to edit, or import JSON first, then use Clone & bind.");
      return;
    }
    const model = loadSettingsCache().shared.model;
    const result = scaffoldWorkflowForModel(model, {
      sourceJson,
      tokens: {
        positive: placeholderTokens.positive,
        negative: placeholderTokens.negative,
        seed: placeholderTokens.seed,
        width: placeholderTokens.width,
        height: placeholderTokens.height,
        cfg: placeholderTokens.cfg,
        steps: placeholderTokens.steps,
        sampler: placeholderTokens.sampler,
        scheduler: placeholderTokens.scheduler,
        shift: placeholderTokens.shift,
        fluxMaxShift: placeholderTokens.fluxMaxShift,
        fluxBaseShift: placeholderTokens.fluxBaseShift,
        denoise: placeholderTokens.denoise,
        inputImage: placeholderTokens.inputImage,
        maskImage: placeholderTokens.maskImage,
      },
    });
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || suggestedScaffoldName(model, "clone"),
      workflowJson: result.json,
    });
    refresh();
    setNewName("");
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    onStatus?.(
      `Cloned workflow with ${result.bindingChanges} binding${result.bindingChanges === 1 ? "" : "s"} applied · assigned to ${model}.`,
    );
  }, [assignInferredModels, editingJson, newName, onStatus, placeholderTokens, refresh, startEdit]);

  const optimizeAndSaveCopy = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.("Open a workflow in Edit JSON first, or import JSON, then use Optimize & save copy.");
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sourceJson) as Record<string, unknown>;
    } catch {
      onStatus?.("Workflow JSON is invalid — fix syntax before optimizing.");
      return;
    }

    const model = loadSettingsCache().shared.model;
    const shared = loadSettingsCache().shared;
    const queueParams = resolveQueueParams({
      model,
      qualityProfile: shared.queueQualityProfile,
    });
    const result = optimizeWorkflowForQueue({
      workflow: parsed,
      tokens: placeholderTokens,
      model,
      qualityProfile: shared.queueQualityProfile,
      upscaleModelFilename: queueParams.upscaleModelFilename,
      refinerCheckpointFilename: queueParams.refinerCheckpointFilename,
    });
    const baseName = editingName.trim() || newName.trim() || "workflow";
    const saved = upsertComfyWorkflowFile({
      name: suggestedOptimizedWorkflowName(baseName),
      workflowJson: result.workflowJson,
    });
    refresh();
    setNewName("");
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    const bindingNote =
      result.bindingChanges.length > 0
        ? `${result.bindingChanges.length} binding(s) applied`
        : "already bound";
    const warnNote =
      result.audit.warnings.length > 0
        ? ` · ${result.audit.warnings.length} review note(s)`
        : "";
    onStatus?.(`Saved optimized copy (${bindingNote}${warnNote}) · assigned to ${model}.`);
  }, [
    assignInferredModels,
    editingJson,
    editingName,
    newName,
    onStatus,
    placeholderTokens,
    refresh,
    startEdit,
  ]);

  const optimizeAllInLibrary = useCallback(() => {
    const files = loadComfyWorkflowFiles();
    if (files.length === 0) {
      onStatus?.("Import or create workflows first, then optimize all.");
      return;
    }

    const result = optimizeAllWorkflowsInLibrary({ tokens: placeholderTokens });
    refresh();
    const warningNote =
      result.warnings.length > 0 ? ` · ${result.warnings.slice(0, 2).join(" · ")}` : "";
    onStatus?.(
      `Optimized ${result.updated} workflow(s) in place · ${result.skipped} unchanged or skipped${warningNote}`,
    );
  }, [onStatus, placeholderTokens, refresh]);

  const selectFile = useCallback(
    (id: string | undefined, label: string) => {
      setSelectedWorkflowFileId(id);
      setSelectedId(id);
      onStatus?.(
        id ? `Default for Send to ComfyUI: “${label}”.` : "Using fallback workflow (Settings / server env).",
      );
    },
    [onStatus],
  );

  const removeFile = useCallback(
    (id: string) => {
      deleteComfyWorkflowFile(id);
      clearSelectedWorkflowFileIfDeleted(id);
      if (editingId === id) {
        cancelEdit();
      }
      refresh();
      onStatus?.("Workflow file deleted.");
    },
    [cancelEdit, editingId, onStatus, refresh],
  );

  return (
    <section className="ui-meta-panel space-y-4">
      <div className="space-y-1">
        <h2 className="type-heading">ComfyUI workflow library</h2>
        <p className="type-caption">
          Manage multiple ComfyUI API workflow JSON files. Pick the active file from
          the dropdown next to <strong className="font-medium text-zinc-300">Send to ComfyUI</strong> on
          any result panel. URL, tokens, and queue params still come from the connection
          settings below (or server env).
        </p>
      </div>

      <ToolActionRow>
        <TextInput
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Name for new/imported workflow"
          className="min-w-[14rem] flex-1"
        />
        <label className="ui-file-input-label ui-btn-secondary ui-btn-sm">
          Import .json
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importFile(file);
              }
              event.target.value = "";
            }}
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={createBlank}>
          New workflow
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createScaffoldForModel}>
          Scaffold for model
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
          onClick={optimizeAndSaveCopy}
          disabled={!editingJson.trim()}
        >
          Optimize &amp; save copy
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={optimizeAllInLibrary}>
          Optimize all in library
        </Button>
        <ChipButton active={!selectedId} onClick={() => selectFile(undefined, "")}>
          Use fallback default
        </ChipButton>
      </ToolActionRow>
      <p className="mb-4 text-xs text-zinc-500">
        After importing community JSON, run <strong className="font-medium text-zinc-400">Optimize all in library</strong>{" "}
        so placeholders bind to your checkpoint/VAE maps. Confirm filenames match ComfyUI&apos;s model lists.
      </p>

      {importError ? (
        <div className="space-y-1 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5" role="alert">
          <p className="type-caption text-rose-300">{importError}</p>
          {importErrorDetail ? (
            <p className="type-caption whitespace-pre-wrap text-rose-200/75">{importErrorDetail}</p>
          ) : null}
        </div>
      ) : null}
      {importNotice ? (
        <p className="type-caption text-amber-300/90">{importNotice}</p>
      ) : null}

      {serverFiles.length > 0 && (
        <div className="space-y-2">
          <p className="type-overline">Server workflow files</p>
          <ul className="ui-list">
            {serverFiles.map((entry) => {
              const active = selectedId === entry.id;
              return (
                <li
                  key={entry.id}
                  className="ui-list-row"
                  data-highlight={active ? "true" : undefined}
                >
                  <div className="ui-list-primary min-w-0">
                    <p className="type-heading">{entry.name}</p>
                    <p className="type-caption">Server workflow</p>
                  </div>
                  <Button
                    type="button"
                    variant={active ? "accent-outline" : "secondary"}
                    size="sm"
                    onClick={() => selectFile(entry.id, entry.name)}
                  >
                    {active ? "Selected" : "Use for Send"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="type-overline">
          Imported workflow files ({files.length})
        </p>
        {files.length === 0 ? (
          <div className="ui-empty-state">
            <p className="type-body">No workflow files yet.</p>
            <p className="type-caption mt-1">
              Export workflows from ComfyUI (Save → API format) and import them here.
            </p>
          </div>
        ) : (
          <ul className="ui-list">
            {files.map((file) => {
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
                  data-highlight={active ? "true" : undefined}
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="type-heading">
                        {displayName}
                        {active && (
                          <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">
                            Active
                          </span>
                        )}
                      </p>
                      <p className="type-caption">
                        {sourceFilename ? `${sourceFilename} · ` : ""}
                        {new Date(file.createdAt).toLocaleString()} ·{" "}
                        {(file.workflowJson.length / 1024).toFixed(1)} KB
                      </p>
                      {inferredModels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="type-caption text-violet-300/80">
                            Suggested: {inferredModels.join(", ")}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => assignInferredModels(file.id, inferredModels)}
                          >
                            Assign to models
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => assignInferredModels(file.id, inferredModels, true)}
                          >
                            Overwrite map
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <ToolActionRow>
                      <Button
                        type="button"
                        variant={active ? "accent-outline" : "secondary"}
                        size="sm"
                        onClick={() => selectFile(file.id, displayName)}
                      >
                        {active ? "Selected" : "Use for Send"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => (isEditing ? cancelEdit() : startEdit(file))}
                      >
                        {isEditing ? "Close" : "Edit JSON"}
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
                          onChange={(event) => setEditingName(event.target.value)}
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="type-caption">Workflow JSON (ComfyUI API format)</span>
                        <MonoTextArea
                          value={editingJson}
                          onChange={(event) => {
                            setEditingJson(event.target.value);
                            setEditError(null);
                          }}
                          rows={14}
                          spellCheck={false}
                          className="text-emerald-200"
                        />
                      </label>
                      {editError && (
                        <p className="text-xs text-rose-300">{editError}</p>
                      )}
                      {editingValidation && (
                        <p className="text-xs text-zinc-500">
                          {editingValidation.ok ? (
                            <>
                              Placeholders: {editingValidation.placeholders?.positive ?? 0}×{" "}
                              {placeholderTokens.positive}
                              {(editingValidation.placeholders?.negative ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.negative}× ${placeholderTokens.negative}`
                                : ""}
                              {(editingValidation.placeholders?.seed ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.seed}× ${placeholderTokens.seed}`
                                : ""}
                              {(editingValidation.placeholders?.width ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.width}× ${placeholderTokens.width}`
                                : ""}
                              {(editingValidation.placeholders?.height ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.height}× ${placeholderTokens.height}`
                                : ""}
                              {(editingValidation.placeholders?.cfg ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.cfg}× ${placeholderTokens.cfg}`
                                : ""}
                              {(editingValidation.placeholders?.steps ?? 0) > 0
                                ? ` · ${editingValidation.placeholders?.steps}× ${placeholderTokens.steps}`
                                : ""}
                            </>
                          ) : (
                            <span className="text-amber-400/90">
                              {editingValidation.error}
                            </span>
                          )}
                        </p>
                      )}
                      {editingNodeMappings.length > 0 ? (
                        <div className="ui-surface-inset">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="type-caption text-violet-200">Suggested node bindings</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const hints = editingNodeMappings
                                  .filter((mapping) => mapping.suggestedBinding)
                                  .map(
                                    (mapping) =>
                                      `${mapping.nodeId} (${mapping.classType}) → ${mapping.suggestedBinding}`,
                                  )
                                  .join("\n");
                                void navigator.clipboard.writeText(hints);
                                onStatus?.("Copied node binding hints.");
                              }}
                            >
                              Copy hints
                            </Button>
                            <Button
                              type="button"
                              variant="accent-outline"
                              size="sm"
                              onClick={() => {
                                const applied = applyWorkflowNodeBindings(
                                  editingJson,
                                  editingNodeMappings,
                                  placeholderTokens,
                                );
                                if (applied.changes.length === 0) {
                                  setBindingPreview(
                                    "No changes — placeholders may already be present.",
                                  );
                                  onStatus?.("No binding changes needed.");
                                  return;
                                }
                                setEditingJson(applied.json);
                                setBindingPreview(summarizeBindingChanges(applied.changes));
                                onStatus?.(
                                  `Applied ${applied.changes.length} binding(s). Review and save.`,
                                );
                              }}
                            >
                              Apply bindings
                            </Button>
                          </div>
                          {bindingPreview ? (
                            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] text-zinc-400">
                              {bindingPreview}
                            </pre>
                          ) : null}
                          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                            {editingNodeMappings.map((mapping) => (
                              <li key={mapping.nodeId}>
                                <span className="text-zinc-200">{mapping.nodeId}</span> ·{" "}
                                {mapping.classType}
                                {mapping.suggestedBinding ? ` → ${mapping.suggestedBinding}` : ""}
                                <span className="text-zinc-600"> — {mapping.reason}</span>
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

      <p className="text-xs text-zinc-600">
        Server env: set{" "}
        <code className="rounded bg-zinc-800 px-1 text-violet-300">COMFYUI_WORKFLOW_DIR</code>{" "}
        or{" "}
        <code className="rounded bg-zinc-800 px-1 text-violet-300">COMFYUI_WORKFLOW_PATHS</code>{" "}
        to expose additional JSON files from disk.
      </p>

      <div className="ui-surface-inset space-y-3">
        <h3 className="type-heading">Workflow preset packs</h3>
        <p className="type-caption">
          Bundle saved workflow presets for import/export between browsers or team members.
        </p>
        <ToolActionRow>
          <TextInput
            value={packName}
            onChange={(event) => setPackName(event.target.value)}
            placeholder="Pack name"
            className="min-w-[180px] flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const name = packName.trim() || `Pack ${new Date().toLocaleDateString()}`;
              const pack: WorkflowPresetPack = {
                id: crypto.randomUUID(),
                name,
                tags: ["workflows"],
                createdAt: Date.now(),
                presets: [],
              };
              upsertWorkflowPresetPack(pack);
              setPresetPacks(loadWorkflowPresetPacks());
              setPackName("");
              onStatus?.(`Created preset pack “${name}”.`);
            }}
          >
            New pack
          </Button>
          <label className="ui-file-input-label ui-btn-secondary ui-btn-sm">
            Import pack
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((raw) => {
                  try {
                    const pack = importWorkflowPresetPack(raw);
                    upsertWorkflowPresetPack(pack);
                    const installed = applyWorkflowPresetPackToLibrary(pack);
                    refresh();
                    setPresetPacks(loadWorkflowPresetPacks());
                    onStatus?.(
                      `Imported preset pack “${pack.name}” and installed ${installed} workflow(s).`,
                    );
                  } catch (error) {
                    onStatus?.(
                      error instanceof Error ? error.message : "Invalid preset pack JSON.",
                    );
                  }
                });
                event.target.value = "";
              }}
            />
          </label>
        </ToolActionRow>
        {presetPacks.length === 0 ? (
          <p className="type-caption">No preset packs saved yet.</p>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="type-caption">Active pack for saving</span>
              <SelectInput
                value={activePackId}
                onChange={(event) => setActivePackId(event.target.value)}
              >
                <option value="">Select pack…</option>
                {presetPacks.map((pack) => (
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
                onClick={() => {
                  const file = files.find((entry) => entry.id === selectedId);
                  if (!file || !activePackId) return;
                  const updated = addPresetsToPack(activePackId, [
                    workflowFileToPreset(file),
                  ]);
                  setPresetPacks(loadWorkflowPresetPacks());
                  onStatus?.(
                    updated
                      ? `Added “${file.name}” to pack “${updated.name}”.`
                      : "Could not update pack.",
                  );
                }}
              >
                Add selected workflow to pack
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!activePackId}
                onClick={() => {
                  const settings = loadComfyUiSettings();
                  const workflowJson = settings.workflowJson?.trim();
                  if (!workflowJson || !activePackId) {
                    onStatus?.("Save a workflow JSON in ComfyUI settings first.");
                    return;
                  }
                  const updated = addPresetsToPack(activePackId, [
                    {
                      id: crypto.randomUUID(),
                      name: `Settings snapshot ${new Date().toLocaleString()}`,
                      createdAt: Date.now(),
                      workflowJson,
                      apiUrl: settings.apiUrl,
                      positiveToken: settings.positiveToken,
                      negativeToken: settings.negativeToken,
                      queueParams: settings.queueParams,
                      customTokens: settings.customTokens,
                    },
                  ]);
                  setPresetPacks(loadWorkflowPresetPacks());
                  onStatus?.(
                    updated
                      ? `Saved current ComfyUI settings snapshot to “${updated.name}”.`
                      : "Could not update pack.",
                  );
                }}
              >
                Save current settings to pack
              </Button>
            </ToolActionRow>
            <ul className="ui-list">
            {presetPacks.map((pack) => (
              <li
                key={pack.id}
                className="ui-list-row text-xs"
              >
                <span className="ui-list-primary type-caption">
                  {pack.name} · {pack.presets.length} preset(s)
                </span>
                <ToolActionRow>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pack.presets.length === 0}
                    onClick={() => {
                      const count = applyWorkflowPresetPackToLibrary(pack);
                      refresh();
                      onStatus?.(`Installed ${count} workflow(s) from “${pack.name}”.`);
                    }}
                  >
                    Install
                  </Button>
                  <Button
                    type="button"
                    variant="accent-outline"
                    size="sm"
                    onClick={() => {
                      downloadText(`${pack.name.replace(/\s+/g, "-")}-workflow-pack.json`, exportWorkflowPresetPack(pack));
                      onStatus?.(`Exported preset pack “${pack.name}”.`);
                    }}
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

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
