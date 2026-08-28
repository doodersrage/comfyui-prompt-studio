'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepareWorkflowJsonImport } from '@/lib/workflow-import';
import type { CustomWorkflowToken } from '@/lib/comfyui-config';
import { validateWorkflowJson, type WorkflowPlaceholderTokens } from '@/lib/comfyui-config';
import {
  deleteComfyWorkflowFile,
  getWorkflowTokenValue,
  loadComfyWorkflowFiles,
  setWorkflowTokenValue,
  upsertComfyWorkflowFile,
  workflowFileNameFromPath,
  type ComfyWorkflowFile,
} from '@/lib/comfyui-workflow-files';
import {
  clearSelectedWorkflowFileIfDeleted,
  getSelectedWorkflowFileId,
  setSelectedWorkflowFileId,
} from '@/lib/comfyui-runtime';
import {
  addPresetsToPack,
  applyWorkflowPresetPackToLibrary,
  exportWorkflowPresetPack,
  importWorkflowPresetPack,
  loadWorkflowPresetPacks,
  upsertWorkflowPresetPack,
  workflowFileToPreset,
  type WorkflowPresetPack,
} from '@/lib/workflow-preset-packs';
import { suggestWorkflowNodeMappings } from '@/lib/workflow-node-mapper';
import { applyWorkflowNodeBindings, summarizeBindingChanges } from '@/lib/workflow-apply-bindings';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { markOnboardingWorkflowImported } from '@/lib/onboarding-hooks';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { loadComfyUiSettings, syncLightningLoraLibraryEntry } from '@/lib/comfyui-settings';
import {
  buildControlNetWorkflowScaffold,
  buildFaceDetailerWorkflowScaffold,
  buildIdentityWorkflowScaffold,
  scaffoldWorkflowForModel,
  suggestedScaffoldName,
} from '@/lib/workflow-scaffold';
import { inspectWorkflowGraphJson } from '@/lib/workflow-graph-inspect';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';
import { assignWorkflowToInferredModels } from '@/lib/model-workflow-map';
import {
  optimizeWorkflowForQueue,
  suggestedOptimizedWorkflowName,
} from '@/lib/workflow-queue-optimizer';
import {
  optimizeAllWorkflowsInLibrary,
  optimizeWorkflowFileInLibrary,
} from '@/lib/workflow-library-batch';
import { diffWorkflowNodes } from '@/lib/workflow-diff';
import { WORKFLOW_HEALTH_SELECT_EVENT } from '@/lib/workflow-health-audit';
import { downloadText } from '@/lib/download-text';
import type { ServerWorkflowOption } from '@/hooks/useComfyWorkflowSelection';

export type UseComfyWorkflowLibraryOptions = {
  placeholderTokens: WorkflowPlaceholderTokens;
  onStatus?: (message: string) => void;
};

export function useComfyWorkflowLibrary({
  placeholderTokens,
  onStatus,
}: UseComfyWorkflowLibraryOptions) {
  const [files, setFiles] = useState<ComfyWorkflowFile[]>([]);
  const [serverFiles, setServerFiles] = useState<ServerWorkflowOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingJson, setEditingJson] = useState('');
  const [editingTokens, setEditingTokens] = useState<CustomWorkflowToken[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetail, setImportErrorDetail] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [optimizePreviewSummary, setOptimizePreviewSummary] = useState<string | null>(null);
  const [presetPacks, setPresetPacks] = useState<WorkflowPresetPack[]>([]);
  const [packName, setPackName] = useState('');
  const [activePackId, setActivePackId] = useState('');
  const [bindingPreview, setBindingPreview] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setFiles(loadComfyWorkflowFiles());
    setSelectedId(getSelectedWorkflowFileId());
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refresh();
      setPresetPacks(loadWorkflowPresetPacks());
      void fetch('/api/comfyui/workflows')
        .then(response => response.json())
        .then((data: { workflows?: ServerWorkflowOption[] }) => {
          setServerFiles(data.workflows ?? []);
        })
        .catch(() => {
          setServerFiles([]);
        });
    });
  }, [refresh]);

  const selectFile = useCallback(
    (id: string | undefined, label: string) => {
      setSelectedWorkflowFileId(id);
      setSelectedId(id);
      onStatus?.(
        id
          ? `Default for Send to ComfyUI: “${label}”.`
          : 'Using fallback workflow (Settings / server env).'
      );
    },
    [onStatus]
  );

  useEffect(() => {
    const onHealthSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ workflowId?: string; action?: string }>).detail;
      const workflowId = detail?.workflowId?.trim();
      if (!workflowId) {
        return;
      }
      const file = loadComfyWorkflowFiles().find(entry => entry.id === workflowId);
      if (!file) {
        onStatus?.('Workflow no longer in library.');
        return;
      }
      selectFile(workflowId, file.name);
      if (detail?.action === 'optimize-workflow') {
        const result = optimizeWorkflowFileInLibrary({
          fileId: workflowId,
          tokens: placeholderTokens,
        });
        refresh();
        onStatus?.(result.message);
      }
    };
    window.addEventListener(WORKFLOW_HEALTH_SELECT_EVENT, onHealthSelect);
    return () => window.removeEventListener(WORKFLOW_HEALTH_SELECT_EVENT, onHealthSelect);
  }, [onStatus, placeholderTokens, refresh, selectFile]);

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

  const editingGraphInspect = useMemo(
    () => (editingJson.trim() ? inspectWorkflowGraphJson(editingJson) : null),
    [editingJson]
  );

  const startEdit = useCallback((file: ComfyWorkflowFile) => {
    setEditingId(file.id);
    setEditingName(file.name);
    setEditingJson(file.workflowJson);
    setEditingTokens(file.customTokens ?? []);
    setEditError(null);
  }, []);

  const persistEditingTokens = useCallback(
    (nextTokens: CustomWorkflowToken[]) => {
      setEditingTokens(nextTokens);
      if (!editingId) {
        return;
      }
      const existing = files.find(entry => entry.id === editingId);
      if (!existing) {
        return;
      }
      const saved = upsertComfyWorkflowFile({
        id: editingId,
        createdAt: existing.createdAt,
        filename: existing.filename,
        name: existing.name,
        workflowJson: existing.workflowJson,
        customTokens: nextTokens,
        lastOptimizedAt: existing.lastOptimizedAt,
        lastOptimizedHash: existing.lastOptimizedHash,
        lastOptimizedModel: existing.lastOptimizedModel,
        lastOptimizedProfile: existing.lastOptimizedProfile,
      });
      setFiles(previous => previous.map(entry => (entry.id === saved.id ? saved : entry)));
      const lightning = getWorkflowTokenValue(nextTokens, '{{LORA_LIGHTNING}}').trim();
      if (lightning) {
        syncLightningLoraLibraryEntry(lightning);
      }
    },
    [editingId, files]
  );

  const assignInferredModels = useCallback(
    (
      workflowId: string,
      models: ReturnType<typeof inferModelsFromWorkflowLabel>,
      overwrite = false
    ) => {
      if (models.length === 0) {
        onStatus?.('No suggested models for this workflow label.');
        return;
      }
      const shared = loadSettingsCache().shared;
      const nextMap = assignWorkflowToInferredModels(
        workflowId,
        models,
        shared.modelWorkflowMap,
        overwrite
      );
      saveSharedSettings({
        ...shared,
        modelWorkflowMap: nextMap,
        selectedWorkflowFileId: workflowId,
      });
      setSelectedWorkflowFileId(workflowId);
      setSelectedId(workflowId);
      onStatus?.(`Assigned workflow to ${models.length} model(s): ${models.join(', ')}`);
    },
    [onStatus]
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
          setImportError(prepared.error ?? 'Invalid workflow JSON.');
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
          lastOptimizedAt: Date.now(),
          lastOptimizedHash: prepared.contentHash,
          lastOptimizedModel: prepared.optimizeModel,
          lastOptimizedProfile: prepared.optimizeProfile,
        });
        refresh();
        setNewName('');
        setSelectedWorkflowFileId(saved.id);
        setSelectedId(saved.id);
        startEdit(saved);
        const inferred = inferModelsFromWorkflowLabel({
          name: saved.name,
          filename: saved.filename,
        });
        setImportNotice(
          [prepared.notice, inferred.length ? `Suggested models: ${inferred.join(', ')}` : null]
            .filter(Boolean)
            .join(' · ') || null
        );
        onStatus?.(
          `Imported “${saved.filename ?? saved.name}” · ${prepared.placeholders?.positive ?? 0}× ${placeholderTokens.positive}`
        );
        markOnboardingWorkflowImported();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed.';
        setImportError(message);
        onStatus?.(message);
      }
    },
    [newName, onStatus, placeholderTokens, refresh, startEdit]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName('');
    setEditingJson('');
    setEditingTokens([]);
    setEditError(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) {
      return;
    }

    const validation = validateWorkflowJson(editingJson, placeholderTokens);
    if (!validation.ok) {
      setEditError(validation.error ?? 'Invalid workflow JSON.');
      return;
    }

    const existing = files.find(entry => entry.id === editingId);
    const saved = upsertComfyWorkflowFile({
      id: editingId,
      createdAt: existing?.createdAt,
      filename: existing?.filename,
      name: editingName.trim() || existing?.name || 'Workflow',
      workflowJson: editingJson.trim(),
      customTokens: editingTokens,
      lastOptimizedAt: existing?.lastOptimizedAt,
      lastOptimizedHash: existing?.lastOptimizedHash,
      lastOptimizedModel: existing?.lastOptimizedModel,
      lastOptimizedProfile: existing?.lastOptimizedProfile,
    });
    refresh();
    cancelEdit();
    onStatus?.(`Saved workflow “${saved.name}”.`);
  }, [
    cancelEdit,
    editingId,
    editingJson,
    editingName,
    editingTokens,
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
    setNewName('');
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
      name: newName.trim() || suggestedScaffoldName(model, 'template'),
      workflowJson: result.json,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    onStatus?.(
      `Created ${result.category} scaffold for ${model} · assigned to model map. ${result.notes[0] ?? ''}`.trim()
    );
  }, [assignInferredModels, newName, onStatus, placeholderTokens, refresh, startEdit]);

  const createControlNetScaffold = useCallback(() => {
    const result = buildControlNetWorkflowScaffold({
      positive: placeholderTokens.positive,
      negative: placeholderTokens.negative,
      seed: placeholderTokens.seed,
      width: placeholderTokens.width,
      height: placeholderTokens.height,
      cfg: placeholderTokens.cfg,
      steps: placeholderTokens.steps,
      sampler: placeholderTokens.sampler,
      scheduler: placeholderTokens.scheduler,
      denoise: placeholderTokens.denoise,
    });
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || 'ControlNet scaffold',
      workflowJson: result.json,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    onStatus?.(`Created ControlNet scaffold. ${result.notes[0] ?? ''}`.trim());
  }, [newName, onStatus, placeholderTokens, refresh, startEdit]);

  const createFaceDetailerScaffold = useCallback(() => {
    const result = buildFaceDetailerWorkflowScaffold();
    const saved = upsertComfyWorkflowFile({
      name: newName.trim() || 'FaceDetailer scaffold',
      workflowJson: result.json,
    });
    const shared = loadSettingsCache().shared;
    saveSharedSettings({
      ...shared,
      modelWorkflowMap: {
        ...(shared.modelWorkflowMap ?? {}),
        faceDetailer: saved.id,
      },
    });
    refresh();
    setNewName('');
    startEdit(saved);
    onStatus?.(
      `Created FaceDetailer scaffold and pinned faceDetailer=${saved.id}. ${result.notes[0] ?? ''}`.trim()
    );
  }, [newName, onStatus, refresh, startEdit]);

  const createIdentityScaffold = useCallback(
    (kind: 'instantid' | 'pulid') => {
      const result = buildIdentityWorkflowScaffold(kind);
      const label = kind === 'pulid' ? 'PuLID' : 'InstantID';
      const saved = upsertComfyWorkflowFile({
        name: newName.trim() || `${label} scaffold`,
        workflowJson: result.json,
      });
      refresh();
      setNewName('');
      startEdit(saved);
      onStatus?.(`Created ${label} BYO scaffold. ${result.notes[0] ?? ''}`.trim());
    },
    [newName, onStatus, refresh, startEdit]
  );

  const cloneAndBindWorkflow = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.('Select a workflow to edit, or import JSON first, then use Clone & bind.');
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
      name: newName.trim() || suggestedScaffoldName(model, 'clone'),
      workflowJson: result.json,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    onStatus?.(
      `Cloned workflow with ${result.bindingChanges} binding${result.bindingChanges === 1 ? '' : 's'} applied · assigned to ${model}.`
    );
  }, [assignInferredModels, editingJson, newName, onStatus, placeholderTokens, refresh, startEdit]);

  const previewOptimizeCopy = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.('Open a workflow in Edit JSON first to preview optimize changes.');
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sourceJson) as Record<string, unknown>;
    } catch {
      onStatus?.('Workflow JSON is invalid — fix syntax before previewing optimize.');
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
      enrichSdxlRefiner: shared.workflowSdxlRefinerEnrich !== false,
      enrichNeuralPolish: shared.workflowNeuralUpscalePolish !== false,
      enrichSharpen: shared.workflowSharpenAfterUpscale === true,
    });
    const nodeDiff = diffWorkflowNodes(sourceJson, result.workflowJson);
    const modified = nodeDiff.filter(entry => entry.change === 'modified').length;
    const added = nodeDiff.filter(entry => entry.change === 'added').length;
    setOptimizePreviewSummary(
      `Preview: ${result.bindingChanges.length} binding(s), ${added} node(s) added, ${modified} node(s) modified, ${result.audit.warnings.length} review note(s).`
    );
  }, [editingJson, onStatus, placeholderTokens]);

  const optimizeAndSaveCopy = useCallback(() => {
    const sourceJson = editingJson.trim();
    if (!sourceJson) {
      onStatus?.(
        'Open a workflow in Edit JSON first, or import JSON, then use Optimize & save copy.'
      );
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sourceJson) as Record<string, unknown>;
    } catch {
      onStatus?.('Workflow JSON is invalid — fix syntax before optimizing.');
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
      enrichSdxlRefiner: shared.workflowSdxlRefinerEnrich !== false,
      enrichNeuralPolish: shared.workflowNeuralUpscalePolish !== false,
      enrichSharpen: shared.workflowSharpenAfterUpscale === true,
    });
    const baseName = editingName.trim() || newName.trim() || 'workflow';
    const saved = upsertComfyWorkflowFile({
      name: suggestedOptimizedWorkflowName(baseName),
      workflowJson: result.workflowJson,
      lastOptimizedAt: Date.now(),
      lastOptimizedHash: result.contentHash,
      lastOptimizedModel: String(model),
      lastOptimizedProfile: shared.queueQualityProfile,
    });
    refresh();
    setNewName('');
    startEdit(saved);
    assignInferredModels(saved.id, [model]);
    const bindingNote =
      result.bindingChanges.length > 0
        ? `${result.bindingChanges.length} binding(s) applied`
        : 'already bound';
    const warnNote =
      result.audit.warnings.length > 0 ? ` · ${result.audit.warnings.length} review note(s)` : '';
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
    const libraryFiles = loadComfyWorkflowFiles();
    if (libraryFiles.length === 0) {
      onStatus?.('Import or create workflows first, then optimize all.');
      return;
    }

    const result = optimizeAllWorkflowsInLibrary({ tokens: placeholderTokens });
    refresh();
    const warningNote =
      result.warnings.length > 0 ? ` · ${result.warnings.slice(0, 2).join(' · ')}` : '';
    const modelsNote =
      result.modelsUsed.length > 0
        ? ` · models: ${result.modelsUsed.slice(0, 4).join(', ')}${result.modelsUsed.length > 4 ? '…' : ''}`
        : '';
    onStatus?.(
      `Optimized ${result.updated} workflow(s) in place · ${result.skipped} unchanged or skipped${modelsNote}${warningNote}`
    );
  }, [onStatus, placeholderTokens, refresh]);

  const removeFile = useCallback(
    (id: string) => {
      deleteComfyWorkflowFile(id);
      clearSelectedWorkflowFileIfDeleted(id);
      if (editingId === id) {
        cancelEdit();
      }
      refresh();
      onStatus?.('Workflow file deleted.');
    },
    [cancelEdit, editingId, onStatus, refresh]
  );

  const handlePackImport = useCallback(
    (summary: string) => {
      refresh();
      setImportNotice(summary);
      onStatus?.(summary);
    },
    [onStatus, refresh]
  );

  const createNewPack = useCallback(() => {
    const name = packName.trim() || `Pack ${new Date().toLocaleDateString()}`;
    const pack: WorkflowPresetPack = {
      id: crypto.randomUUID(),
      name,
      tags: ['workflows'],
      createdAt: Date.now(),
      presets: [],
    };
    upsertWorkflowPresetPack(pack);
    setPresetPacks(loadWorkflowPresetPacks());
    setPackName('');
    onStatus?.(`Created preset pack “${name}”.`);
  }, [onStatus, packName]);

  const importPresetPackFile = useCallback(
    (file: File) => {
      void file.text().then(raw => {
        try {
          const pack = importWorkflowPresetPack(raw);
          upsertWorkflowPresetPack(pack);
          const installed = applyWorkflowPresetPackToLibrary(pack);
          refresh();
          setPresetPacks(loadWorkflowPresetPacks());
          onStatus?.(`Imported preset pack “${pack.name}” and installed ${installed} workflow(s).`);
        } catch (error) {
          onStatus?.(error instanceof Error ? error.message : 'Invalid preset pack JSON.');
        }
      });
    },
    [onStatus, refresh]
  );

  const addSelectedWorkflowToPack = useCallback(() => {
    const file = files.find(entry => entry.id === selectedId);
    if (!file || !activePackId) {
      return;
    }
    const updated = addPresetsToPack(activePackId, [workflowFileToPreset(file)]);
    setPresetPacks(loadWorkflowPresetPacks());
    onStatus?.(
      updated ? `Added “${file.name}” to pack “${updated.name}”.` : 'Could not update pack.'
    );
  }, [activePackId, files, onStatus, selectedId]);

  const saveCurrentSettingsToPack = useCallback(() => {
    const comfySettings = loadComfyUiSettings();
    const workflowJson = comfySettings.workflowJson?.trim();
    if (!workflowJson || !activePackId) {
      onStatus?.('Save a workflow JSON in ComfyUI settings first.');
      return;
    }
    const updated = addPresetsToPack(activePackId, [
      {
        id: crypto.randomUUID(),
        name: `Settings snapshot ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        workflowJson,
        apiUrl: comfySettings.apiUrl,
        positiveToken: comfySettings.positiveToken,
        negativeToken: comfySettings.negativeToken,
        queueParams: comfySettings.queueParams,
        customTokens: comfySettings.customTokens,
      },
    ]);
    setPresetPacks(loadWorkflowPresetPacks());
    onStatus?.(
      updated
        ? `Saved current ComfyUI settings snapshot to “${updated.name}”.`
        : 'Could not update pack.'
    );
  }, [activePackId, onStatus]);

  const installPresetPack = useCallback(
    (pack: WorkflowPresetPack) => {
      const count = applyWorkflowPresetPackToLibrary(pack);
      refresh();
      onStatus?.(`Installed ${count} workflow(s) from “${pack.name}”.`);
    },
    [onStatus, refresh]
  );

  const exportPresetPack = useCallback(
    (pack: WorkflowPresetPack) => {
      downloadText(
        `${pack.name.replace(/\s+/g, '-')}-workflow-pack.json`,
        exportWorkflowPresetPack(pack)
      );
      onStatus?.(`Exported preset pack “${pack.name}”.`);
    },
    [onStatus]
  );

  const copyBindingHints = useCallback(() => {
    const hints = editingNodeMappings
      .filter(mapping => mapping.suggestedBinding)
      .map(mapping => `${mapping.nodeId} (${mapping.classType}) → ${mapping.suggestedBinding}`)
      .join('\n');
    void navigator.clipboard.writeText(hints);
    onStatus?.('Copied node binding hints.');
  }, [editingNodeMappings, onStatus]);

  const applyBindings = useCallback(() => {
    const applied = applyWorkflowNodeBindings(editingJson, editingNodeMappings, placeholderTokens);
    if (applied.changes.length === 0) {
      setBindingPreview('No changes — placeholders may already be present.');
      onStatus?.('No binding changes needed.');
      return;
    }
    setEditingJson(applied.json);
    setBindingPreview(summarizeBindingChanges(applied.changes));
    onStatus?.(`Applied ${applied.changes.length} binding(s). Review and save.`);
  }, [editingJson, editingNodeMappings, onStatus, placeholderTokens]);

  return {
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
    refresh,
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
  };
}

export type ComfyWorkflowLibraryViewModel = ReturnType<typeof useComfyWorkflowLibrary>;
