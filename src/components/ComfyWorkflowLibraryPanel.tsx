"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  validateWorkflowJson,
  type WorkflowPlaceholderTokens,
} from "@/lib/comfyui-config";
import {
  deleteComfyWorkflowFile,
  loadComfyWorkflowFiles,
  upsertComfyWorkflowFile,
  workflowFileNameFromPath,
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
import { markOnboardingWorkflowImported } from "@/lib/onboarding-hooks";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import type { ServerWorkflowOption } from "@/hooks/useComfyWorkflowSelection";
import { Button } from "@/components/ui/Button";
import { ChipButton, MonoTextArea, SelectInput, TextInput } from "@/components/ui/Field";
import { ToolActionRow } from "@/components/ui/ToolPageShell";

type ComfyWorkflowLibraryPanelProps = {
  placeholderTokens: Pick<WorkflowPlaceholderTokens, "positive" | "negative">;
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
  const [presetPacks, setPresetPacks] = useState<WorkflowPresetPack[]>([]);
  const [packName, setPackName] = useState("");
  const [activePackId, setActivePackId] = useState("");

  const refresh = useCallback(() => {
    setFiles(loadComfyWorkflowFiles());
    setSelectedId(getSelectedWorkflowFileId());
  }, []);

  useEffect(() => {
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

  const importFile = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text();
        const validation = validateWorkflowJson(raw, placeholderTokens);
        if (!validation.ok) {
          setEditError(validation.error ?? "Invalid workflow JSON.");
          return;
        }

        const saved = upsertComfyWorkflowFile({
          name:
            newName.trim() ||
            workflowFileNameFromPath(file.name) ||
            `Workflow ${new Date().toLocaleString()}`,
          filename: file.name,
          workflowJson: raw.trim(),
        });
        refresh();
        setNewName("");
        setSelectedWorkflowFileId(saved.id);
        setSelectedId(saved.id);
        onStatus?.(
          `Imported “${saved.filename ?? saved.name}” · ${validation.placeholders?.positive ?? 0}× ${placeholderTokens.positive}`,
        );
        markOnboardingWorkflowImported();
      } catch (err) {
        onStatus?.(err instanceof Error ? err.message : "Import failed.");
      }
    },
    [newName, onStatus, placeholderTokens, refresh],
  );

  const startEdit = useCallback((file: ComfyWorkflowFile) => {
    setEditingId(file.id);
    setEditingName(file.name);
    setEditingJson(file.workflowJson);
    setEditError(null);
  }, []);

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
        <ChipButton active={!selectedId} onClick={() => selectFile(undefined, "")}>
          Use fallback default
        </ChipButton>
      </ToolActionRow>

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
              return (
                <li
                  key={file.id}
                  className="ui-list-row flex-col items-stretch !min-h-0 !items-start gap-0 !p-0"
                  data-highlight={active ? "true" : undefined}
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="type-heading">
                        {file.filename ?? file.name}
                        {active && (
                          <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">
                            Active
                          </span>
                        )}
                      </p>
                      <p className="type-caption">
                        {file.name !== (file.filename ?? file.name) ? `${file.name} · ` : ""}
                        {new Date(file.createdAt).toLocaleString()} ·{" "}
                        {(file.workflowJson.length / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <ToolActionRow>
                      <Button
                        type="button"
                        variant={active ? "accent-outline" : "secondary"}
                        size="sm"
                        onClick={() => selectFile(file.id, file.filename ?? file.name)}
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
                          </div>
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
