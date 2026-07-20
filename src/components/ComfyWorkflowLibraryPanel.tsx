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
  exportWorkflowPresetPack,
  importWorkflowPresetPack,
  loadWorkflowPresetPacks,
  upsertWorkflowPresetPack,
  type WorkflowPresetPack,
} from "@/lib/workflow-preset-packs";
import type { ServerWorkflowOption } from "@/hooks/useComfyWorkflowSelection";

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
    <section className="space-y-4 rounded-2xl border border-emerald-900/40 bg-zinc-900/60 p-6">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-zinc-200">ComfyUI workflow library</h2>
        <p className="text-sm text-zinc-400">
          Manage multiple ComfyUI API workflow JSON files. Pick the active file from
          the dropdown next to <strong className="font-medium text-zinc-300">Send to ComfyUI</strong> on
          any result panel. URL, tokens, and queue params still come from the connection
          settings below (or server env).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Name for new/imported workflow"
          className="min-w-[14rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <label className="cursor-pointer rounded-lg border border-emerald-700/60 px-4 py-2 text-sm font-medium text-emerald-200 hover:border-emerald-500">
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
        <button
          type="button"
          onClick={createBlank}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
        >
          New workflow
        </button>
        <button
          type="button"
          onClick={() => selectFile(undefined, "")}
          className={`rounded-lg border px-4 py-2 text-sm ${
            !selectedId
              ? "border-violet-500 bg-violet-500/15 text-violet-200"
              : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          Use fallback default
        </button>
      </div>

      {serverFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Server workflow files
          </p>
          <ul className="space-y-2">
            {serverFiles.map((entry) => {
              const active = selectedId === entry.id;
              return (
                <li
                  key={entry.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    active
                      ? "border-violet-500/50 bg-violet-500/10"
                      : "border-zinc-800 bg-zinc-950/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">{entry.name}</p>
                    <p className="truncate text-xs text-zinc-500">Server workflow</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectFile(entry.id, entry.name)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      active
                        ? "border-violet-500 text-violet-200"
                        : "border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-violet-200"
                    }`}
                  >
                    {active ? "Selected" : "Use for Send"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Imported workflow files ({files.length})
        </p>
        {files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/30 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">No workflow files yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Export workflows from ComfyUI (Save → API format) and import them here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => {
              const active = selectedId === file.id;
              const isEditing = editingId === file.id;
              return (
                <li
                  key={file.id}
                  className={`rounded-xl border ${
                    active
                      ? "border-violet-500/50 bg-violet-500/10"
                      : "border-zinc-800 bg-zinc-950/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        {file.filename ?? file.name}
                        {active && (
                          <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">
                            Active
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {file.name !== (file.filename ?? file.name) ? `${file.name} · ` : ""}
                        {new Date(file.createdAt).toLocaleString()} ·{" "}
                        {(file.workflowJson.length / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => selectFile(file.id, file.filename ?? file.name)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-violet-500 hover:text-violet-200"
                      >
                        {active ? "Selected" : "Use for Send"}
                      </button>
                      <button
                        type="button"
                        onClick={() => (isEditing ? cancelEdit() : startEdit(file))}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500"
                      >
                        {isEditing ? "Close" : "Edit JSON"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:border-rose-500 hover:text-rose-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <div className="space-y-3 border-t border-zinc-800 px-4 py-4">
                      <label className="block space-y-1 text-xs text-zinc-400">
                        Display name
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                        />
                      </label>
                      <label className="block space-y-1 text-xs text-zinc-400">
                        Workflow JSON (ComfyUI API format)
                        <textarea
                          value={editingJson}
                          onChange={(event) => {
                            setEditingJson(event.target.value);
                            setEditError(null);
                          }}
                          rows={14}
                          spellCheck={false}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-emerald-200"
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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
                        >
                          Save workflow
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                        >
                          Cancel
                        </button>
                      </div>
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

      <div className="mt-6 space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
        <h3 className="text-sm font-medium text-zinc-200">Workflow preset packs</h3>
        <p className="text-xs text-zinc-500">
          Bundle saved workflow presets for import/export between browsers or team members.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={packName}
            onChange={(event) => setPackName(event.target.value)}
            placeholder="Pack name"
            className="ui-input min-w-[180px] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
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
          </button>
          <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500">
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
                    setPresetPacks(loadWorkflowPresetPacks());
                    onStatus?.(`Imported preset pack “${pack.name}”.`);
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
        </div>
        {presetPacks.length === 0 ? (
          <p className="text-xs text-zinc-600">No preset packs saved yet.</p>
        ) : (
          <ul className="space-y-2">
            {presetPacks.map((pack) => (
              <li
                key={pack.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400"
              >
                <span>
                  {pack.name} · {pack.presets.length} preset(s)
                </span>
                <button
                  type="button"
                  className="text-violet-300 hover:text-violet-200"
                  onClick={() => {
                    downloadText(`${pack.name.replace(/\s+/g, "-")}-workflow-pack.json`, exportWorkflowPresetPack(pack));
                    onStatus?.(`Exported preset pack “${pack.name}”.`);
                  }}
                >
                  Export
                </button>
              </li>
            ))}
          </ul>
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
